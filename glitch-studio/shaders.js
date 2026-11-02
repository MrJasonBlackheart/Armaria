const VERT = `attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

const COMMON = `precision highp float;
varying vec2 vUv;
uniform vec2 uRes; uniform float uTime; uniform float uBeat;
float hash(float n){ return fract(sin(n*127.1)*43758.5453); }
float hash2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float lum(vec3 c){ return dot(c,vec3(.299,.587,.114)); }
`;

// Pass 1: morph + collage + glitch
const FRAG1 = COMMON + `
uniform sampler2D uA,uB,uC,uD,uPrev;
UNIFORMS
vec3 pick(float i, vec2 uv){
  if(i<.5) return texture2D(uA,uv).rgb;
  if(i<1.5) return texture2D(uB,uv).rgb;
  if(i<2.5) return texture2D(uC,uv).rgb;
  return texture2D(uD,uv).rgb;
}
vec3 morphed(vec2 uv){
  float m = clamp(u_morph,0.,1.);
  float t = u_morphType;
  vec3 a, b;
  if(t<.5){ return mix(texture2D(uA,uv).rgb, texture2D(uB,uv).rgb, m); }
  if(t<1.5){ // slice wipe
    float thr = hash(floor(uv.y*24.));
    float k = step(thr, m*1.25-.125);
    return mix(texture2D(uA,uv).rgb, texture2D(uB,uv).rgb, k);
  }
  if(t<2.5){ // pixel dissolve
    float k = step(hash2(floor(uv*uRes/6.)), m);
    return mix(texture2D(uA,uv).rgb, texture2D(uB,uv).rgb, k);
  }
  if(t<3.5){ // displacement morph
    vec3 ca = texture2D(uA,uv).rgb, cb = texture2D(uB,uv).rgb;
    vec2 d = vec2(lum(cb)-.5, lum(ca)-.5)*.35;
    a = texture2D(uA, uv + d*m).rgb;
    b = texture2D(uB, uv - d*(1.-m)).rgb;
    return mix(a,b,smoothstep(.2,.8,m));
  }
  if(t<4.5){ // block shuffle
    vec2 c = floor(uv*vec2(16.,9.));
    float k = step(hash2(c), m);
    vec2 o = (vec2(hash2(c+3.),hash2(c+7.))-.5)*.1*sin(m*3.14159);
    return mix(texture2D(uA,uv+o).rgb, texture2D(uB,uv+o).rgb, k);
  }
  // luma wipe
  b = texture2D(uB,uv).rgb;
  float k = smoothstep(0., .15, m*1.15 - (1.-lum(b)));
  return mix(texture2D(uA,uv).rgb, b, k);
}
vec3 scene(vec2 uv){
  vec3 col = morphed(uv);
  if(u_collage>.001){
    float t = floor(uTime*u_collageRate);
    vec2 cell = floor(uv*u_cells);
    float r = hash2(cell+t*1.7);
    if(r < u_collage){
      vec2 cuv = mix(uv, fract(uv*u_cells), u_tile);
      col = pick(floor(hash2(cell+t+11.)*4.), cuv);
    }
  }
  return col;
}
vec3 hueRot(vec3 c, float a){
  float cs=cos(a), sn=sin(a);
  mat3 m = mat3(.299+.701*cs+.168*sn, .299-.299*cs-.328*sn, .299-.3*cs+1.25*sn,
                .587-.587*cs+.33*sn, .587+.413*cs+.035*sn, .587-.588*cs-1.05*sn,
                .114-.114*cs-.497*sn, .114-.114*cs+.292*sn, .114+.886*cs-.203*sn);
  return clamp(m*c,0.,1.);
}
void main(){
  vec2 uv = vUv;
  float t = floor(uTime*u_glitchRate);
  if(u_mirrorX>.5 && uv.x>.5) uv.x = 1.-uv.x;
  if(u_mirrorY>.5 && uv.y>.5) uv.y = 1.-uv.y;
  if(u_pixel>1.5){ vec2 g = uRes/u_pixel; uv = (floor(uv*g)+.5)/g; }
  uv.x += sin(uv.y*u_waveFreq + uTime*u_waveSpeed)*u_waveAmp;
  float inv = 0.;
  if(u_blockAmt>.001){
    vec2 cell = floor(uv*vec2(u_blockX,u_blockY));
    float r = hash2(cell+t);
    if(r<u_blockAmt){
      uv += (vec2(hash2(cell+t+1.),hash2(cell+t+2.))-.5)*u_blockShift;
      inv = step(hash2(cell+t+5.), u_invertAmt);
    }
  }
  if(u_sliceAmt>.001){
    float band = floor(uv.y*u_sliceCount);
    if(hash(band+t*3.1)<u_sliceAmt) uv.x += (hash(band*1.3+t)-.5)*u_sliceShift;
  }
  if(u_smearAmt>.001){
    float row = floor(uv.y*uRes.y/4.);
    if(hash(row+t*7.)<u_smearAmt*.3){ uv.x = mix(uv.x, hash(row+t)*.9, step(hash(row*2.+t),.5)*hash(row+9.)); }
  }
  uv = fract(uv+1.0); // wrap rather than smear at edges
  vec2 dir = vec2(cos(u_rgbAngle), sin(u_rgbAngle))*u_rgbSplit;
  vec3 col;
  if(u_rgbSplit>.0005){ col = vec3(scene(uv+dir).r, scene(uv).g, scene(uv-dir).b); }
  else col = scene(uv);
  if(u_chanSwap>.001) col = mix(col, col.gbr, u_chanSwap);
  col = mix(col, 1.-col, inv);
  col = mix(col, abs(col*2.-1.), u_solarize);
  if(u_posterize<31.5) col = floor(col*u_posterize+.5)/u_posterize;
  if(u_hue>.001) col = hueRot(col,u_hue);
  col = mix(col, vec3(lum(col)), u_mono);
  if(u_feedback>.001){
    vec2 p = vUv-.5; float cs=cos(u_fbRot), sn=sin(u_fbRot);
    p = mat2(cs,-sn,sn,cs)*p/u_fbZoom + .5;
    vec3 pv = texture2D(uPrev,p).rgb;
    col = max(col, pv*u_feedback);
    col = mix(col, pv, u_feedback*.5*step(lum(col),lum(pv)));
  }
  col += uBeat*u_flash;
  gl_FragColor = vec4(clamp(col,0.,1.),1.);
}`;

// Pass 2: CRT + VCR
const FRAG2 = COMMON + `
uniform sampler2D uTex;
UNIFORMS
vec3 samp(vec2 uv){ return texture2D(uTex,uv).rgb; }
void main(){
  vec2 uv = vUv;
  float T = uTime;
  // vertical roll
  uv.y = fract(uv.y + T*u_rollSpeed*u_roll);
  // barrel distortion
  vec2 c = uv*2.-1.;
  c *= 1. + u_barrel*dot(c,c)*.5;
  vec2 cuv = c*.5+.5;
  float inside = step(0.,cuv.x)*step(cuv.x,1.)*step(0.,cuv.y)*step(cuv.y,1.);
  uv = cuv;
  float line = floor(uv.y*u_scanCount);
  // tracking wobble & jitter (horizontal displacement per line)
  float wob = sin(uv.y*6.+T*1.7)*sin(uv.y*23.-T*3.1);
  uv.x += wob*u_tracking*.02;
  uv.x += (hash(line+floor(T*30.))-.5)*u_jitter*.015;
  // moving tracking-noise band
  float bandPos = fract(T*.13);
  float inBand = smoothstep(.0,.03,uv.y-bandPos)*(1.-smoothstep(.04,.09,uv.y-bandPos));
  uv.x += inBand*u_trackBand*(hash(line+T)-.5)*.12;
  // head-switch tear at the bottom
  float hs = smoothstep(.1,.0,uv.y);
  uv.x += hs*hs*u_headSwitch*(.06+.04*sin(T*40.+line));
  // interlace
  if(u_interlace>.001){ uv.x += mod(line+floor(T*60.),2.)*u_interlace*.004; }
  vec2 px = vec2(1./uRes.x, 0.);
  vec3 col = samp(uv);
  // luma smear (horizontal)
  if(u_lumaSmear>.001){
    vec3 acc = col; float w = 1.;
    for(int i=1;i<8;i++){ float f=float(i); float k = exp(-f*.5); acc += samp(uv-px*f*3.*u_lumaSmear)*k; w+=k; }
    col = acc/w;
  }
  // chroma bleed: blur chroma, offset it right
  if(u_chromaBleed>.001){
    vec3 acc = vec3(0.);
    for(int i=0;i<8;i++){ acc += samp(uv - px*(float(i)*2.5*u_chromaBleed - 4.*u_chromaBleed)); }
    acc /= 8.;
    float y = lum(col);
    vec3 chroma = acc - lum(acc);
    col = vec3(y) + chroma;
  }
  // ghosting
  if(u_ghost>.001) col += samp(uv-px*18.)*u_ghost*.35 + samp(uv-px*34.)*u_ghost*.15;
  // bloom (cheap 8-tap)
  if(u_bloom>.001){
    vec3 b = vec3(0.); vec2 o = 3./uRes;
    for(int i=0;i<8;i++){ float a=float(i)*.785398; b += samp(uv+vec2(cos(a),sin(a))*o*(1.+mod(float(i),2.)*1.5)); }
    col += max(b/8.-.35,0.)*u_bloom*1.6;
  }
  // dropouts: short white/black horizontal streaks
  if(u_dropout>.001){
    float r = hash2(vec2(line, floor(T*24.)));
    float x0 = hash2(vec2(line,floor(T*24.)+3.));
    float len = hash2(vec2(line,floor(T*24.)+5.))*.25;
    float on = step(r,u_dropout*.04)*step(x0,uv.x)*step(uv.x,x0+len);
    col = mix(col, vec3(lum(col)>.4?0.:1.), on*.9);
  }
  // static
  float n = hash2(uv*uRes + fract(T)*100.);
  col = mix(col, vec3(n), u_noise*.6*n);
  col += (hash2(vec2(line,T*50.))-.5)*u_noise*.1;
  // scanlines & mask
  float sl = .5+.5*cos(uv.y*u_scanCount*6.2831);
  col *= 1. - u_scanline*(1.-sl)*.8;
  if(u_mask>.001){
    float m = mod(gl_FragCoord.x,3.);
    vec3 mk = vec3(step(m,1.),step(1.,m)*step(m,2.),step(2.,m))*.6+.4;
    col = mix(col, col*mk*1.5, u_mask);
  }
  // flicker, vignette, color grade
  col *= 1. - u_flicker*(.15+.15*sin(T*60.))*hash(floor(T*20.));
  float v = smoothstep(1.2,.3,length((uv-.5)*vec2(1.,.85)));
  col *= mix(1., v, u_vignette);
  col = mix(vec3(lum(col)), col, u_saturation);
  col = (col-.5)*u_contrast+.5+u_brightness;
  col *= inside;
  gl_FragColor = vec4(clamp(col,0.,1.),1.);
}`;
