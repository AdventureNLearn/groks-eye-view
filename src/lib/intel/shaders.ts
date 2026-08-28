export const NVG_SHADER = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
void main() {
  vec4 c = texture(colorTexture, v_textureCoordinates);
  float g = dot(c.rgb, vec3(0.07, 0.72, 0.21));
  float v = pow(g, 0.82) * 1.35;
  float grain = fract(sin(dot(v_textureCoordinates * 400.0, vec2(12.9898, 78.233))) * 43758.5453);
  v += (grain - 0.5) * 0.04;
  out_FragColor = vec4(vec3(0.04, v, 0.07), 1.0);
}
`;

export const FLIR_SHADER = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
void main() {
  vec4 c = texture(colorTexture, v_textureCoordinates);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 cold = vec3(0.02, 0.04, 0.18);
  vec3 mid = vec3(0.72, 0.12, 0.08);
  vec3 hot = vec3(0.98, 0.92, 0.45);
  vec3 col = mix(cold, mid, smoothstep(0.0, 0.45, l));
  col = mix(col, hot, smoothstep(0.45, 1.0, l));
  out_FragColor = vec4(col, 1.0);
}
`;

export const CRT_SHADER = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
void main() {
  vec2 uv = v_textureCoordinates;
  vec2 off = (uv - 0.5);
  uv = 0.5 + off * (1.0 + dot(off, off) * 0.12);
  vec4 c = texture(colorTexture, uv);
  float scan = 0.86 + 0.14 * sin(uv.y * 920.0);
  c.r = texture(colorTexture, uv + vec2(0.0012, 0.0)).r;
  c.b = texture(colorTexture, uv - vec2(0.0012, 0.0)).b;
  c.rgb *= scan;
  c.rgb = mix(vec3(0.05, 0.07, 0.04), c.rgb, 0.92);
  out_FragColor = vec4(c.rgb, 1.0);
}
`;

export const NOIR_SHADER = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
void main() {
  vec4 c = texture(colorTexture, v_textureCoordinates);
  float l = dot(c.rgb, vec3(0.25, 0.55, 0.20));
  l = smoothstep(0.05, 0.9, l);
  vec3 col = vec3(l);
  col = mix(vec3(0.04, 0.045, 0.055), col, 0.92);
  out_FragColor = vec4(col, 1.0);
}
`;

export const SNOW_SHADER = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
void main() {
  vec4 c = texture(colorTexture, v_textureCoordinates);
  float l = dot(c.rgb, vec3(0.22, 0.48, 0.30));
  vec3 ice = vec3(0.78, 0.86, 0.94);
  vec3 ink = vec3(0.07, 0.09, 0.12);
  vec3 col = mix(ink, ice, smoothstep(0.04, 0.92, pow(l, 0.85)));
  col = mix(col, vec3(1.0), smoothstep(0.78, 1.0, l) * 0.35);
  out_FragColor = vec4(col, 1.0);
}
`;
