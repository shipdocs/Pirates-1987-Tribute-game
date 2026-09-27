// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// De zee op de grafische kaart: een fragment-shader die per pixel een golfveld
// uitrekent en belicht. Canvas 2D kan alleen tegels verschuiven; hier krijgt
// elk golfje een eigen helling, en daarmee zonlicht, glinstering en schuim.
//
// De shader tekent op een eigen canvas buiten beeld, dat `tekenZee` daarna in
// het gewone 2D-canvas blit. Zo blijven lagen, miniatuureffect en nachtsluier
// ongemoeid. Lukt WebGL niet (oude browser, context verloren), dan geeft
// `tekenZeeGL` false en valt `tekenZee` terug op de tegels.
import { clamp } from '../util.js';
import { ZON_X, ZON_Y } from './hulpjes.js';

// --- Shaders --------------------------------------------------------------

const HOEKPUNT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Alle lengtes in wereldeenheden: golven liggen óp de wereld, dus ze bewegen
// met land en schepen mee en worden groter als je inzoomt. `uZoom` is het
// aantal CSS-pixels per wereldeenheid; daarmee dooft elke golf uit zodra hij
// kleiner wordt dan een paar pixels, anders wordt uitgezoomde zee korrelruis.
const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform vec2 uCam;
uniform float uZoom;
uniform float uTijd;
uniform vec2 uWind;
uniform float uKracht;
uniform vec2 uDrift;
uniform float uSchemer;
uniform float uDonker;
uniform vec2 uZon;

// Maat van het golfveld in wereldeenheden. Op de speelzoom (1,9) moet een
// deining een paar scheepslengtes beslaan en de rimpeling nog net te zien
// zijn; op de oorspronkelijke maat was de zee daar één zachte vlek.
const float M = 0.4;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float ruis(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Een golf: richting (hoek t.o.v. de wind), golflengte, hoogte. Telt de
// hoogte en de helling op in h en g, en de genormaliseerde kruin in k.
void golf(vec2 p, float hoek, float lengte, float hoogte,
          inout float h, inout vec2 g) {
  float c = cos(hoek), s = sin(hoek);
  vec2 d = vec2(uWind.x * c - uWind.y * s, uWind.x * s + uWind.y * c);
  float k = 6.2831853 / lengte;
  // Wie kleiner is dan een paar pixels, telt niet meer mee.
  float zicht = smoothstep(4.0, 18.0, lengte * uZoom);
  float a = hoogte * zicht;
  float fase = k * dot(d, p) - uTijd * sqrt(k) * 7.0;
  h += a * sin(fase);
  g += a * k * cos(fase) * d;
}

void main() {
  vec2 scherm = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 p = uCam + (scherm - uRes * 0.5) / uZoom;
  // De stroming van de wind, per beeld opgeteld (zie zeeDriftBij).
  vec2 q = p - uDrift * 14.0;
  // Een trage kronkel door het hele veld: rechte sinussen lezen als ribbelglas,
  // verbogen golffronten als water.
  vec2 kronkel = vec2(ruis(q / (140.0 * M)), ruis(q / (140.0 * M) + 19.1)) - 0.5;
  vec2 qw = q + kronkel * 70.0 * M;

  float kr = clamp(uKracht, 0.25, 2.0);
  float vlek = ruis(q / (640.0 * M));
  float zeegang = (0.5 + 0.5 * kr) * (0.7 + 0.6 * vlek);

  // Deining: lang en flauw, de basis van licht en donker.
  float h = 0.0;
  vec2 g = vec2(0.0);
  golf(qw, 0.00, 260.0 * M, 1.00, h, g);
  golf(qw, 0.60, 170.0 * M, 0.65, h, g);
  golf(qw, -0.50, 130.0 * M, 0.55, h, g);
  float deining = h;
  // Golfslag: korter; zijn kruinen breken bij harde wind tot schuim.
  float hs = 0.0;
  vec2 gs = vec2(0.0);
  golf(qw, 0.30, 62.0 * M, 0.30, hs, gs);
  golf(qw, -0.80, 47.0 * M, 0.24, hs, gs);
  golf(qw, 1.10, 33.0 * M, 0.14, hs, gs);
  h = (deining + hs) * zeegang;
  // De normaal van alleen de lange deining: daarop ligt de zachte glans. Van
  // de korte golfslag werd die glans een regen van losse vlokken.
  // Kortere golven zijn steiler bij gelijke hoogte; M houdt de helling gelijk.
  vec3 n0 = normalize(vec3(-g * zeegang * 5.0 * M, 1.0));
  g = (g + gs * 1.25) * zeegang;
  // Fijne rimpeling uit ruis, alleen dichtbij: geeft het oppervlak textuur.
  float rz = smoothstep(3.0, 9.0, 8.0 * M * uZoom);
  vec2 rq = qw / (8.0 * M) + uWind * uTijd * 0.4;
  float r0 = ruis(rq);
  g += vec2(ruis(rq + vec2(0.4, 0.0)) - r0, ruis(rq + vec2(0.0, 0.4)) - r0) * 0.035 * rz;
  vec3 n = normalize(vec3(-g * 5.0 * M, 1.0));

  // Basiskleur: dezelfde verloop-tinten als de tegelzee, zodat banken en
  // kusten erop blijven passen. Bovenaan dieper, in het midden turkoois.
  float y = vUv.y;
  vec3 diep = vec3(0.051, 0.247, 0.408);
  vec3 midden = vec3(0.102, 0.435, 0.580);
  vec3 onder = vec3(0.043, 0.204, 0.322);
  vec3 kleur = y > 0.58 ? mix(midden, diep, (y - 0.58) / 0.42) : mix(onder, midden, smoothstep(0.0, 0.58, y));

  // Licht van de vaste zon linksboven, net als alle slagschaduwen.
  vec3 L = normalize(vec3(uZon, 1.3));
  float diffuus = dot(n, L);
  kleur *= 0.7 + 0.66 * diffuus;
  // De kam van de deining is lichter en groener: de zon schijnt erdoorheen.
  float kam = clamp(deining * 0.28 + 0.5, 0.0, 1.0);
  kleur = mix(kleur, vec3(0.15, 0.52, 0.6), smoothstep(0.5, 1.0, kam) * 0.18);

  // Losse witte kruinstreken lazen bij elke windkracht als regen; van de
  // golfslag blijft alleen het schuim over, verderop.
  float zichtLijn = smoothstep(10.0, 34.0, 47.0 * M * uZoom);
  float kruin = hs / 0.68;

  // Wolkenschaduw: trage donkere vlakken die met de wind meedrijven.
  float wolk = smoothstep(0.55, 0.85, ruis((p - uDrift * 60.0) / 1500.0) * 0.7 + ruis(p / 610.0 + 3.1) * 0.3);
  kleur *= 1.0 - 0.14 * wolk;

  // Glinstering: spaarzame vonkjes waar een golfhelling de zon precies naar
  // je toe kaatst. Een smal venster, anders wordt het sneeuw.
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = clamp(dot(n, H), 0.0, 1.0);
  // Zachte glans op de golfhellingen, en vonkjes van de rimpeling alleen in
  // de plekken waar de zee toevallig het licht vangt — overal tegelijk
  // vonken werd confetti.
  float glans = pow(clamp(dot(n0, H), 0.0, 1.0), 150.0) * 0.5;
  float vangt = smoothstep(0.66, 0.9, ruis(q / (110.0 * M) + uTijd * 0.05));
  float spec = glans + pow(nh, 3200.0) * 1.2 * vangt;
  float zon = clamp(1.0 - uSchemer * 1.35, 0.0, 1.0) * (1.0 - wolk * 0.7);
  kleur += vec3(1.0, 0.95, 0.82) * spec * zon * smoothstep(8.0, 24.0, 33.0 * M * uZoom);

  // 's Nachts een koel spoor van de maan, even spaarzaam.
  float maan = smoothstep(0.6, 0.9, uSchemer);
  vec3 Lm = normalize(vec3(-uZon.x, uZon.y * 0.4, 1.4));
  float nm = clamp(dot(n, normalize(Lm + vec3(0.0, 0.0, 1.0))), 0.0, 1.0);
  float nm0 = clamp(dot(n0, normalize(Lm + vec3(0.0, 0.0, 1.0))), 0.0, 1.0);
  kleur += vec3(0.7, 0.85, 1.0) * (pow(nm0, 500.0) * 0.28 + pow(nm, 2400.0) * 1.2 * vangt) * maan;

  // Schuim bij harde wind: slierten langs de wind op de kruinen, niet vlekken.
  float schuimKans = smoothstep(1.0, 1.8, kr);
  vec2 langs = vec2(dot(q, uWind), dot(q, vec2(-uWind.y, uWind.x)));
  float sliert = ruis(langs / (vec2(60.0, 5.0) * M));
  float breek = smoothstep(0.7, 0.95, kruin) * smoothstep(0.55, 0.85, sliert);
  kleur = mix(kleur, vec3(0.86, 0.93, 0.95), breek * schuimKans * 0.55 * zichtLijn);

  // Zonder aparte nachtsluier dooft de zee zelf.
  kleur = mix(kleur, kleur * vec3(0.22, 0.28, 0.42), uDonker);
  gl_FragColor = vec4(clamp(kleur, 0.0, 1.0), 1.0);
}`;

// --- Staat ----------------------------------------------------------------

let staat = null;
let opgegeven = false;

function bouw() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const shader = (soort, bron) => {
    const s = gl.createShader(soort);
    gl.shaderSource(s, bron);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || 'shader');
    }
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, HOEKPUNT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  for (const naam of ['uRes', 'uCam', 'uZoom', 'uTijd', 'uWind', 'uKracht', 'uDrift', 'uSchemer', 'uDonker', 'uZon']) {
    u[naam] = gl.getUniformLocation(prog, naam);
  }

  const nieuw = { canvas, gl, u, kapot: false };
  // Een verloren context (driver-reset, tabblad lang weg) valt terug op de
  // tegelzee tot de browser hem teruggeeft; dan bouwen we alles opnieuw.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    nieuw.kapot = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    staat = null;
  });
  return nieuw;
}

/** Is de WebGL-zee beschikbaar? Bouwt hem bij de eerste vraag. */
export function zeeGLBeschikbaar() {
  if (opgegeven) return false;
  if (!staat) {
    try {
      staat = bouw();
    } catch (e) {
      staat = null;
    }
    if (!staat) {
      opgegeven = true;
      return false;
    }
  }
  return !staat.kapot;
}

/**
 * Tekent de zee met de shader en blit hem op (0, 0, vw, vh) in `ctx`.
 * `o`: {cam, vw, vh, tijd, richting, kracht, drift, schemer, donker, schaal}.
 * Geeft false als het niet kan, zodat de aanroeper terugvalt.
 */
export function tekenZeeGL(ctx, o) {
  if (!zeeGLBeschikbaar()) return false;
  const { canvas, gl, u } = staat;
  // De glinstering heeft scherpte nodig, maar boven anderhalf keer de
  // CSS-resolutie ziet niemand het verschil nog en betaalt de kaart wel.
  const schaal = clamp(o.schaal || 1, 1, 1.5);
  const w = Math.max(1, Math.round(o.vw * schaal));
  const h = Math.max(1, Math.round(o.vh * schaal));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
  const zoom = o.cam.zoom || 1;
  const zonLen = Math.hypot(ZON_X, ZON_Y);
  gl.uniform2f(u.uRes, w, h);
  gl.uniform2f(u.uCam, o.cam.x, o.cam.y);
  gl.uniform1f(u.uZoom, zoom * schaal);
  gl.uniform1f(u.uTijd, o.tijd % 10000);
  gl.uniform2f(u.uWind, Math.cos(o.richting), Math.sin(o.richting));
  gl.uniform1f(u.uKracht, o.kracht);
  gl.uniform2f(u.uDrift, o.drift.x, o.drift.y);
  gl.uniform1f(u.uSchemer, o.schemer);
  gl.uniform1f(u.uDonker, o.donker);
  // Het licht komt ván de zon; de schaduwrichting ZON_X/ZON_Y wijst ervan af.
  gl.uniform2f(u.uZon, -ZON_X / zonLen, -ZON_Y / zonLen);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (gl.isContextLost()) return false;
  ctx.drawImage(canvas, 0, 0, o.vw, o.vh);
  return true;
}
