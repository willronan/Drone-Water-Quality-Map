/* ============================================================
   WEBGL LAYER: shaders, meshState, renderer, uploadMesh
   Exposes: window.WebGLLayerModule
============================================================ */

(function () {
  const vertexSource = `
    uniform mat4 u_matrix;
    uniform vec2 u_anchor;

    attribute vec2 a_pos;
    attribute float a_value;

    varying float v_value;

    void main() {
      vec2 worldPos = a_pos + u_anchor;
      gl_Position = u_matrix * vec4(worldPos, 0.0, 1.0);
      v_value = a_value;
    }
  `;

  const fragmentSource = `
    precision mediump float;

    varying float v_value;
    uniform float u_min;
    uniform float u_max;

    vec3 valueToColor(float v) {
      float denom = max(u_max - u_min, 0.000001);
      float t = clamp((v - u_min) / denom, 0.0, 1.0);

      // blue -> red
      vec3 blue = vec3(0.0, 0.0, 1.0);
      vec3 red  = vec3(1.0, 0.0, 0.0);

      return mix(blue, red, t);
    }

    void main() {
      vec3 color = valueToColor(v_value);
      gl_FragColor = vec4(color, 0.85);
    }
  `;

  const meshState = {
    ready: false,
    anchorMercator: null,
    vertices: null,
    vertexCount: 0,
    buffer: null,
    gl: null,
    program: null,
    aPos: null,
    aVal: null,
    uMin: null,
    uMax: null,
    valueMin: 0.0,
    valueMax: 1.0,
    map: null
  };

  const renderer = {
    onAdd: function (map, gl) {
      meshState.map = map;
      meshState.gl = gl;
      meshState.ready = true;

      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, vertexSource);
      gl.compileShader(vs);

      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, fragmentSource);
      gl.compileShader(fs);

      meshState.program = gl.createProgram();
      gl.attachShader(meshState.program, vs);
      gl.attachShader(meshState.program, fs);
      gl.linkProgram(meshState.program);

      meshState.aPos = gl.getAttribLocation(meshState.program, "a_pos");
      meshState.aVal = gl.getAttribLocation(meshState.program, "a_value");
      meshState.uMin = gl.getUniformLocation(meshState.program, "u_min");
      meshState.uMax = gl.getUniformLocation(meshState.program, "u_max");

      meshState.buffer = gl.createBuffer();

      if (meshState.vertices && meshState.anchorMercator) {
        uploadMesh();
      }
    },

    render: function (gl, matrix) {
      if (!meshState.vertexCount) return;

      gl.useProgram(meshState.program);

      gl.uniformMatrix4fv(
        gl.getUniformLocation(meshState.program, "u_matrix"),
        false,
        matrix
      );

      gl.bindBuffer(gl.ARRAY_BUFFER, meshState.buffer);

      gl.enableVertexAttribArray(meshState.aPos);
      gl.vertexAttribPointer(meshState.aPos, 2, gl.FLOAT, false, 12, 0);

      gl.enableVertexAttribArray(meshState.aVal);
      gl.vertexAttribPointer(meshState.aVal, 1, gl.FLOAT, false, 12, 8);

      if (meshState.uMin) gl.uniform1f(meshState.uMin, meshState.valueMin);
      if (meshState.uMax) gl.uniform1f(meshState.uMax, meshState.valueMax);

      const uAnchor = gl.getUniformLocation(meshState.program, "u_anchor");
      if (!meshState.anchorMercator || meshState.anchorMercator.length !== 2) return;
      gl.uniform2fv(uAnchor, meshState.anchorMercator);

      gl.drawArrays(gl.TRIANGLES, 0, meshState.vertexCount);
    }
  };

  function uploadMesh() {
    if (!meshState.ready) return;

    const gl = meshState.gl;
    meshState.vertexCount = meshState.vertices.length / 3;

    gl.bindBuffer(gl.ARRAY_BUFFER, meshState.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(meshState.vertices), gl.STATIC_DRAW);

    forceRepaint();
  }

  function setValueRange(min, max) {
    meshState.valueMin = Number.isFinite(min) ? min : 0.0;
    meshState.valueMax = Number.isFinite(max) ? max : 1.0;
    forceRepaint();
  }

  function forceRepaint() {
    if (!meshState.map) return;
    const cam = meshState.map.getCamera();
    meshState.map.setCamera(cam);
  }

  function clearMesh() {
    meshState.vertices = null;
    meshState.vertexCount = 0;
  }

  window.WebGLLayerModule = {
    meshState,
    renderer,
    uploadMesh,
    clearMesh,
    setValueRange
  };
})();
