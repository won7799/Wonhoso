/* Etherial's optional, pointer-local elastic photo surface. No dependencies. */
(function (root) {
  'use strict';

  const MAX_TEXTURES = 6;
  const MAX_TEXTURE_EDGE = 2048;
  const MAX_PIXEL_RATIO = 1.5;
  const MAX_PULL = 0.075;
  const WRAPPERS = '.artist-portrait, .work-cover, .excerpt-poster, .mallow-image, .news-image';

  // Percentages position the difference between the content box and fitted image,
  // not the image itself. Unsupported CSS positions retain the native image.
  function positionOffset(value, available) {
    const keywords = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
    value = keywords[value] || value;
    if (/^-?(?:\d*\.)?\d+%$/.test(value)) return available * parseFloat(value) / 100;
    if (/^-?(?:\d*\.)?\d+(?:px)?$/.test(value)) return parseFloat(value);
    return NaN;
  }

  function computeMapping(width, height, imageWidth, imageHeight, fit, position) {
    if (![width, height, imageWidth, imageHeight].every(value => Number.isFinite(value) && value > 0)) return null;
    let parts = String(position || '50% 50%').trim().split(/\s+/);
    if (parts.length === 1) parts = /^(top|bottom)$/.test(parts[0]) ? ['50%', parts[0]] : [parts[0], '50%'];
    if (parts.length !== 2) return null;
    if (/^(top|bottom)$/.test(parts[0]) || /^(left|right)$/.test(parts[1])) parts.reverse();
    let renderedWidth = width, renderedHeight = height;
    if (fit !== 'fill') {
      let size;
      if (fit === 'cover') size = Math.max(width / imageWidth, height / imageHeight);
      else if (fit === 'contain') size = Math.min(width / imageWidth, height / imageHeight);
      else if (fit === 'scale-down') size = Math.min(1, width / imageWidth, height / imageHeight);
      else if (fit === 'none') size = 1;
      else return null;
      renderedWidth = imageWidth * size;
      renderedHeight = imageHeight * size;
    }
    const x = positionOffset(parts[0], width - renderedWidth);
    const y = positionOffset(parts[1], height - renderedHeight);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      scale: [width / renderedWidth, height / renderedHeight],
      offset: [-x / renderedWidth, -y / renderedHeight],
      renderedWidth, renderedHeight, x, y
    };
  }

  function zeroSpring() { return { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }; }
  function stepSpring(state, seconds, holdX = 0, holdY = 0) {
    // Substeps keep the spring stable on slow frames and high-refresh displays.
    let remaining = Math.min(0.064, Math.max(0, seconds));
    while (remaining > 0.000001) {
      const dt = Math.min(1 / 120, remaining);
      state.vx += (324 * (state.tx - state.x) - 21.6 * state.vx) * dt;
      state.vy += (324 * (state.ty - state.y) - 21.6 * state.vy) * dt;
      state.x += state.vx * dt;
      state.y += state.vy * dt;
      const decay = Math.exp(-10 * dt);
      state.tx = holdX + (state.tx - holdX) * decay;
      state.ty = holdY + (state.ty - holdY) * decay;
      remaining -= dt;
    }
    return state;
  }
  function isSettled(state, holdX = 0, holdY = 0) {
    return Math.hypot(state.x - holdX, state.y - holdY) < 0.00005 &&
      Math.hypot(state.vx, state.vy) < 0.0008 && Math.hypot(state.tx - holdX, state.ty - holdY) < 0.00005;
  }
  function trimCache(cache, limit, remove) {
    while (cache.size > limit) {
      const first = cache.keys().next().value;
      remove(cache.get(first));
      cache.delete(first);
    }
  }

  // Pure math is exported only in Node, so the isolated test needs no browser.
  if (typeof module === 'object' && module.exports) {
    module.exports = { computeMapping, zeroSpring, stepSpring, isSettled, trimCache, MAX_TEXTURES };
    return;
  }
  if (!root || !root.document || root.ETHERIAL_ELASTIC) return;
  const document = root.document;
  const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = root.matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const connection = root.navigator.connection;
  const textures = new Map();
  const cleanups = [];
  let canvas = null, webglCanvas = null, gl = null, program = null, buffer = null, uniforms = null;
  let renderer = '', svgRoot = null, svgFilter = null, svgField = null, svgOffset = null, svgMatrix = null, svgDisplace = null;
  let active = null, pending = null, frame = 0, lastFrame = 0, generation = 0;
  let failed = false, contextLost = false, destroyed = false, initialized = false;
  let textureEdge = MAX_TEXTURE_EDGE;
  let observer = null;

  const VERTEX = 'attribute vec2 aPosition; varying mediump vec2 vUV; void main(){vUV=vec2((aPosition.x+1.0)*0.5,(1.0-aPosition.y)*0.5);gl_Position=vec4(aPosition,0.0,1.0);}';
  const FRAGMENT = [
    'precision mediump float;',
    'varying mediump vec2 vUV;',
    'uniform sampler2D uImage;',
    'uniform vec2 uScale, uOffset, uPointer, uPull;',
    'uniform float uAspect, uTime;',
    'void main(){',
    ' vec2 original=vUV*uScale+uOffset;',
    ' if(original.x<0.0||original.y<0.0||original.x>1.0||original.y>1.0){gl_FragColor=vec4(0.0);return;}',
    ' vec2 delta=(vUV-uPointer)*vec2(uAspect,1.0);',
    ' float radius=length(delta);',
    ' float influence=exp(-dot(delta,delta)/0.145);',
    ' float edge=min(min(original.x,1.0-original.x),min(original.y,1.0-original.y));',
    ' float anchor=smoothstep(0.0,0.12,edge);',
    ' vec2 direction=delta/max(radius,0.001)/vec2(uAspect,1.0);',
    ' float ripple=sin(radius*23.0-uTime*14.0)*exp(-radius*8.0)*length(uPull)*0.14;',
    ' vec2 displacement=(uPull*influence+direction*ripple)*anchor;',
    ' vec2 source=clamp((vUV-displacement)*uScale+uOffset,0.0,1.0);',
    ' gl_FragColor=texture2D(uImage,source);',
    '}'
  ].join('\n');

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }
  function enabled() {
    return !destroyed && !failed && (!contextLost || renderer === 'svg') && !reducedMotion.matches && finePointer.matches && !connection?.saveData;
  }
  function blocked() {
    return !enabled() || document.hidden || document.body?.classList.contains('dialog-open') ||
      document.body?.classList.contains('menu-open') || !!document.querySelector('.artist-track.is-dragging');
  }
  function detach() {
    if (active?.positionChanged && active.wrapper.style.position === 'relative') {
      active.wrapper.style.position = active.originalPosition;
    }
    if (canvas) { canvas.style.visibility = 'hidden'; canvas.remove(); }
    if (observer) observer.disconnect();
    active = null;
  }
  function reset() {
    generation += 1;
    pending = null;
    if (frame) root.cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    detach();
  }
  function disposeResources() {
    if (gl && !contextLost) {
      textures.forEach(texture => gl.deleteTexture(texture));
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    }
    textures.clear();
    buffer = null;
    program = null;
    uniforms = null;
  }
  function fail(error) {
    document.documentElement.dataset.elasticImages = 'unavailable';
    if (error) root.console?.warn('[Etherial] Elastic images unavailable:', error.message);
    reset();
    disposeResources();
    failed = true;
  }
  function svgNode(name, attributes = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }
  function createSVGRenderer() {
    if (renderer === 'svg' && canvas) return true;
    try {
      // An opaque radial scalar field is shifted to the pointer. The matrix
      // turns its R channel into independent signed R/G displacement channels.
      // Forcing alpha to one also makes empty offset pixels neutral (0.5,0.5).
      const field = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><radialGradient id="r"><stop offset="0" stop-color="white"/><stop offset=".2" stop-color="#eeeeee"/><stop offset=".4" stop-color="#b0b0b0"/><stop offset=".6" stop-color="#606060"/><stop offset=".8" stop-color="#202020"/><stop offset="1" stop-color="black"/></radialGradient></defs><rect width="256" height="256" fill="url(#r)"/></svg>';
      svgRoot = svgNode('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
      svgRoot.dataset.etherialElasticDefinition = '';
      svgRoot.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
      const definitions = svgNode('defs');
      svgFilter = svgNode('filter', {
        id: 'etherial-elastic-displacement', x: 0, y: 0,
        filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB'
      });
      svgField = svgNode('feImage', {
        href: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(field),
        preserveAspectRatio: 'none', result: 'elastic-field'
      });
      svgOffset = svgNode('feOffset', { in: 'elastic-field', result: 'elastic-offset', dx: 0, dy: 0 });
      svgMatrix = svgNode('feColorMatrix', { in: 'elastic-offset', type: 'matrix', result: 'elastic-vector', 'color-interpolation-filters': 'sRGB' });
      svgDisplace = svgNode('feDisplacementMap', { in: 'SourceGraphic', in2: 'elastic-vector', xChannelSelector: 'R', yChannelSelector: 'G', scale: 0 });
      svgFilter.append(svgField, svgOffset, svgMatrix, svgDisplace);
      definitions.append(svgFilter);
      svgRoot.append(definitions);
      document.body.append(svgRoot);
      canvas = document.createElement('img');
      canvas.className = 'elastic-image-canvas elastic-image-svg';
      canvas.dataset.etherialElastic = '';
      canvas.dataset.elasticRenderer = 'svg';
      canvas.alt = '';
      canvas.draggable = false;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText = 'position:absolute;display:block;pointer-events:none;z-index:0;visibility:hidden;max-width:none;';
      listen(canvas, 'load', () => { if (renderer === 'svg' && active) schedule(); });
      listen(canvas, 'error', () => { if (renderer === 'svg' && active) reset(); });
      renderer = 'svg';
      document.documentElement.dataset.elasticImages = 'ready-svg';
      document.documentElement.dataset.elasticRenderer = 'svg';
      return true;
    } catch (error) {
      if (svgRoot) svgRoot.remove();
      svgRoot = null;
      fail(error);
      return false;
    }
  }
  function createProgram() {
    const vertex = gl.createShader(gl.VERTEX_SHADER);
    const fragment = gl.createShader(gl.FRAGMENT_SHADER);
    const next = gl.createProgram();
    if (!vertex || !fragment || !next) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      if (next) gl.deleteProgram(next);
      throw new Error('WebGL resources unavailable');
    }
    gl.shaderSource(vertex, VERTEX);
    gl.shaderSource(fragment, FRAGMENT);
    gl.compileShader(vertex);
    gl.compileShader(fragment);
    gl.attachShader(next, vertex);
    gl.attachShader(next, fragment);
    gl.bindAttribLocation(next, 0, 'aPosition');
    gl.linkProgram(next);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(next, gl.LINK_STATUS)) {
      const reason = gl.getProgramInfoLog(next) || 'link failed';
      gl.deleteProgram(next);
      throw new Error('Elastic shader unavailable: ' + reason);
    }
    program = next;
    buffer = gl.createBuffer();
    if (!buffer) throw new Error('Elastic geometry unavailable');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    uniforms = {};
    ['uImage', 'uScale', 'uOffset', 'uPointer', 'uPull', 'uAspect', 'uTime'].forEach(name => {
      uniforms[name] = gl.getUniformLocation(program, name);
    });
    gl.uniform1i(uniforms.uImage, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.clearColor(0, 0, 0, 0);
    textureEdge = Math.min(MAX_TEXTURE_EDGE, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    document.documentElement.dataset.elasticImages = 'ready-webgl';
    document.documentElement.dataset.elasticRenderer = 'webgl';
  }
  function ensureRenderer() {
    if (renderer === 'svg') return true;
    if (program) return true;
    if (failed || contextLost || destroyed) return false;
    try {
      if (!webglCanvas) {
        webglCanvas = document.createElement('canvas');
        canvas = webglCanvas;
        canvas.className = 'elastic-image-canvas';
        canvas.dataset.etherialElastic = '';
        canvas.setAttribute('aria-hidden', 'true');
        canvas.dataset.elasticRenderer = 'webgl';
        canvas.style.cssText = 'position:absolute;display:block;pointer-events:none;z-index:0;visibility:hidden;max-width:none;';
        listen(canvas, 'webglcontextlost', event => {
          event.preventDefault();
          contextLost = true;
          reset();
          disposeResources();
          createSVGRenderer();
        });
        listen(canvas, 'webglcontextrestored', () => {
          if (destroyed) return;
          contextLost = false;
          if (renderer === 'svg') return;
          try { createProgram(); } catch (error) { fail(error); }
        });
        gl = canvas.getContext('webgl', {
          alpha: true, antialias: false, depth: false, stencil: false,
          premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power'
        });
        if (!gl) throw new Error('WebGL unavailable');
      }
      createProgram();
      renderer = 'webgl';
      return true;
    } catch (error) {
      document.documentElement.dataset.elasticWebgl = 'unavailable';
      disposeResources();
      if (webglCanvas) webglCanvas.remove();
      return createSVGRenderer();
    }
  }
  function textureFor(image) {
    const key = image.currentSrc || image.src;
    if (new URL(key, document.baseURI).origin !== root.location.origin) throw new Error('Only same-origin portraits are enhanced');
    if (textures.has(key)) {
      const texture = textures.get(key);
      textures.delete(key);
      textures.set(key, texture);
      return texture;
    }
    const texture = gl.createTexture();
    if (!texture) throw new Error('Portrait texture unavailable');
    let source = image;
    let staging = null;
    try {
      const ratio = Math.min(1, textureEdge / Math.max(image.naturalWidth, image.naturalHeight));
      if (ratio < 1) {
        staging = document.createElement('canvas');
        staging.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        staging.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = staging.getContext('2d');
        if (!context) throw new Error('Portrait resizing unavailable');
        context.drawImage(image, 0, 0, staging.width, staging.height);
        source = staging;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      // This one allocation-time check avoids displaying an incomplete/black image.
      // Never query the GPU from the animation loop.
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Portrait upload failed');
      textures.set(key, texture);
      trimCache(textures, MAX_TEXTURES, item => gl.deleteTexture(item));
      return texture;
    } catch (error) { gl.deleteTexture(texture); throw error; }
    finally { if (staging) { staging.width = 1; staging.height = 1; } }
  }
  function imageAt(target) {
    if (!(target instanceof root.Element)) return null;
    const wrapper = target.closest(WRAPPERS);
    if (!wrapper) return null;
    const image = Array.from(wrapper.children).find(child => child.tagName === 'IMG');
    return image || null;
  }
  function measure(state) {
    const style = root.getComputedStyle(state.image);
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const width = state.image.clientWidth - paddingX;
    const height = state.image.clientHeight - paddingY;
    const mapping = computeMapping(width, height, state.image.naturalWidth, state.image.naturalHeight, style.objectFit, style.objectPosition);
    if (!mapping) return false;
    const rect = state.image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= root.innerHeight || rect.right <= 0 || rect.left >= root.innerWidth) return false;
    state.rect = rect;
    state.mapping = mapping;
    state.width = width;
    state.height = height;
    canvas.style.left = (state.image.offsetLeft + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) + 'px';
    canvas.style.top = (state.image.offsetTop + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)) + 'px';
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.style.filter = renderer === 'svg'
      ? 'url("#etherial-elastic-displacement")' + (style.filter === 'none' ? '' : ' ' + style.filter)
      : style.filter;
    canvas.style.transform = style.transform;
    canvas.style.transformOrigin = style.transformOrigin;
    if (renderer === 'svg') {
      canvas.style.objectFit = style.objectFit;
      canvas.style.objectPosition = style.objectPosition;
      svgFilter.setAttribute('width', String(width));
      svgFilter.setAttribute('height', String(height));
      [svgOffset, svgMatrix, svgDisplace].forEach(node => {
        node.setAttribute('x', '0'); node.setAttribute('y', '0');
        node.setAttribute('width', String(width)); node.setAttribute('height', String(height));
      });
      const diameter = Math.min(width, height) * 1.05;
      svgField.setAttribute('x', String((width - diameter) / 2));
      svgField.setAttribute('y', String((height - diameter) / 2));
      svgField.setAttribute('width', String(diameter));
      svgField.setAttribute('height', String(diameter));
      return true;
    }
    const ratio = Math.min(MAX_PIXEL_RATIO, root.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      gl.viewport(0, 0, pixelWidth, pixelHeight);
    }
    return true;
  }
  function draw(state) {
    if (renderer === 'svg') {
      const pullX = state.spring.x * state.width;
      const pullY = state.spring.y * state.height;
      // A tight dynamic scale uses the available channel range and avoids the
      // coarse displacement steps produced by a large constant 8-bit scale.
      const scale = Math.max(1, 2 * Math.max(Math.abs(pullX), Math.abs(pullY)));
      svgOffset.setAttribute('dx', String((state.pointer.x - 0.5) * state.width));
      svgOffset.setAttribute('dy', String((state.pointer.y - 0.5) * state.height));
      svgMatrix.setAttribute('values', [
        -pullX / scale, 0, 0, 0, 0.5,
        -pullY / scale, 0, 0, 0, 0.5,
        0, 0, 0, 0, 0.5,
        0, 0, 0, 0, 1
      ].join(' '));
      svgDisplace.setAttribute('scale', String(scale));
      return canvas.complete && canvas.naturalWidth > 0;
    }
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.texture);
    gl.uniform2fv(uniforms.uScale, state.mapping.scale);
    gl.uniform2fv(uniforms.uOffset, state.mapping.offset);
    gl.uniform2f(uniforms.uPointer, state.pointer.x, state.pointer.y);
    gl.uniform2f(uniforms.uPull, state.spring.x, state.spring.y);
    gl.uniform1f(uniforms.uAspect, state.width / state.height);
    gl.uniform1f(uniforms.uTime, state.time);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
  function schedule() {
    if (!frame && active && !blocked()) frame = root.requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    const state = active;
    if (!state || !state.image.isConnected || blocked()) { reset(); return; }
    const elapsed = lastFrame ? Math.min(0.064, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    stepSpring(state.spring, elapsed, state.hold.x, state.hold.y);
    state.time += elapsed;
    state.pointer.x += (state.targetPointer.x - state.pointer.x) * (1 - Math.exp(-24 * elapsed));
    state.pointer.y += (state.targetPointer.y - state.pointer.y) * (1 - Math.exp(-24 * elapsed));
    try {
      if (!measure(state)) { reset(); return; }
      canvas.style.visibility = draw(state) ? 'visible' : 'hidden';
    } catch (error) { fail(error); return; }
    if (isSettled(state.spring, state.hold.x, state.hold.y)) {
      lastFrame = 0;
      // Hold a little local tension under the cursor without an idle RAF loop.
      // Leaving releases it and restores the exact native photo after settling.
      if (Math.hypot(state.hold.x, state.hold.y) < 0.00001) canvas.style.visibility = 'hidden';
      if (!state.hovered) reset();
      return;
    }
    schedule();
  }
  function pointFor(state, event) {
    const rect = state.rect;
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }
  async function activate(image, event) {
    if (blocked() || event.pointerType !== 'mouse' || event.buttons) return;
    if (active?.image === image || pending?.image === image) return;
    reset();
    const token = generation;
    const candidate = { image, wrapper: image.parentElement, clientX: event.clientX, clientY: event.clientY };
    pending = candidate;
    try {
      if (!image.complete || !image.naturalWidth) {
        if (typeof image.decode !== 'function') return;
        await image.decode();
      }
      if (generation !== token || blocked() || !image.isConnected || !image.naturalWidth) return;
      if (!ensureRenderer()) return;
      const texture = renderer === 'webgl' ? textureFor(image) : null;
      if (renderer === 'svg') {
        canvas.src = image.currentSrc || image.src;
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
      }
      const wrapper = image.parentElement;
      const originalPosition = wrapper.style.position;
      const positionChanged = root.getComputedStyle(wrapper).position === 'static';
      if (positionChanged) wrapper.style.position = 'relative';
      const state = {
        image, wrapper, texture, originalPosition, positionChanged,
        spring: zeroSpring(), hold: { x: 0, y: 0 }, hovered: true, time: 0, previousTime: root.performance.now(),
        pointer: { x: 0.5, y: 0.5 }, targetPointer: { x: 0.5, y: 0.5 }, previousPoint: null
      };
      active = state;
      wrapper.insertBefore(canvas, image.nextSibling);
      if (!measure(state)) { reset(); return; }
      const point = pointFor(state, candidate);
      state.pointer = { ...point };
      state.targetPointer = { ...point };
      state.previousPoint = point;
      draw(state);
      // Keep the native photo until actual movement gives the surface energy.
      canvas.style.visibility = 'hidden';
      if (observer) observer.observe(wrapper);
    } catch (error) {
      // A failed or unsupported image keeps its original pixels and interaction.
      if (generation === token) {
        document.documentElement.dataset.elasticImages = 'asset-fallback';
        root.console?.warn('[Etherial] Elastic photo fallback:', error.message);
        reset();
      }
    } finally { if (generation === token) pending = null; }
  }
  function release() {
    if (pending) { reset(); return; }
    if (!active) return;
    active.hovered = false;
    active.hold = { x: 0, y: 0 };
    active.spring.tx = 0;
    active.spring.ty = 0;
    if (isSettled(active.spring)) reset();
    else schedule();
  }
  function onMove(event) {
    if (event.pointerType !== 'mouse') return;
    if (event.buttons || blocked()) { reset(); return; }
    const image = imageAt(event.target);
    if (!image) { release(); return; }
    if (pending?.image === image) {
      pending.clientX = event.clientX;
      pending.clientY = event.clientY;
      return;
    }
    if (active?.image !== image) { activate(image, event); return; }
    const state = active;
    state.hovered = true;
    const point = pointFor(state, event);
    const now = root.performance.now();
    const dt = Math.max(0.008, Math.min(0.06, (now - state.previousTime) / 1000));
    const old = state.previousPoint || point;
    let x = (point.x - old.x) / dt * 0.028;
    let y = (point.y - old.y) / dt * 0.028;
    const distance = Math.hypot(x, y);
    if (distance > MAX_PULL) { x *= MAX_PULL / distance; y *= MAX_PULL / distance; }
    state.spring.tx = state.spring.tx * 0.2 + x * 0.8;
    state.spring.ty = state.spring.ty * 0.2 + y * 0.8;
    if (distance > 0.00001) state.hold = { x: x * 0.22, y: y * 0.22 };
    state.targetPointer = point;
    state.previousPoint = point;
    state.previousTime = now;
    if (distance > 0.00001 || !isSettled(state.spring, state.hold.x, state.hold.y)) schedule();
  }
  function onOver(event) {
    if (event.pointerType !== 'mouse' || event.buttons || blocked()) return;
    const image = imageAt(event.target);
    if (image) activate(image, event);
  }
  function onOut(event) {
    const wrapper = active?.wrapper || pending?.wrapper;
    if (wrapper && !wrapper.contains(event.relatedTarget)) release();
  }
  function refresh() {
    reset();
    // Defensive cleanup if a caller cloned a rendered subtree without resetting.
    document.querySelectorAll('[data-etherial-elastic]').forEach(item => { if (item !== canvas) item.remove(); });
  }
  function destroy() {
    if (destroyed) return;
    reset();
    disposeResources();
    destroyed = true;
    cleanups.splice(0).forEach(cleanup => cleanup());
    if (observer) observer.disconnect();
    if (svgRoot) svgRoot.remove();
    svgRoot = null;
    svgFilter = svgField = svgOffset = svgMatrix = svgDisplace = null;
    if (gl && !contextLost) gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas = null;
    webglCanvas = null;
    gl = null;
  }
  function init() {
    if (initialized || destroyed) return;
    initialized = true;
    document.documentElement.dataset.elasticImages = enabled() ? 'standby' : 'static';
    if ('IntersectionObserver' in root) {
      observer = new root.IntersectionObserver(entries => {
        if (active && entries.some(entry => entry.target === active.wrapper && !entry.isIntersecting)) reset();
      });
    }
    listen(document, 'pointerover', onOver, { passive: true });
    listen(document, 'pointermove', onMove, { passive: true });
    listen(document, 'pointerout', onOut, { passive: true });
    listen(document, 'pointerdown', reset, { passive: true, capture: true });
    listen(document, 'pointercancel', reset, { passive: true });
    listen(document, 'scroll', reset, { passive: true, capture: true });
    listen(document, 'visibilitychange', reset);
    listen(root, 'blur', reset);
    listen(root, 'resize', reset, { passive: true });
    listen(reducedMotion, 'change', reset);
    listen(finePointer, 'change', reset);
    if (connection?.addEventListener) listen(connection, 'change', reset);
    listen(document, 'etherial:before-render', reset);
    listen(document, 'etherial:content-updated', refresh);
    listen(document, 'etherial:gallery-ready', refresh);
    refresh();
  }
  root.ETHERIAL_ELASTIC = Object.freeze({
    reset, refresh, destroy,
    status: () => ({
      enabled: enabled(), initialized, active: !!active, pending: !!pending,
      animating: !!frame, textureCount: textures.size, maxTextures: MAX_TEXTURES,
      contextCreated: !!gl, contextLost, failed, destroyed, renderer: renderer || 'pending'
    })
  });
  if (document.readyState === 'loading') listen(document, 'DOMContentLoaded', init, { once: true });
  else init();
})(typeof window !== 'undefined' ? window : null);
