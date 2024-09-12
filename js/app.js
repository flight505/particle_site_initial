import * as THREE from "three"
import { REVISION } from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js"
import GUI from "lil-gui"
import gsap from "gsap"
import load from 'load-asset'
import PoissonDiskSampling from 'poisson-disk-sampling'

import fragment from "./shader/fragment.glsl"
import fragmentShaderVelocity from "./shader/fragmentShaderVelocity.glsl"
import fragmentShaderPosition from "./shader/fragmentShaderPosition.glsl"
import vertex from "./shader/vertexParticles.glsl"

import t1 from '../ana.jpg'
import t2 from '../2.png'

console.log(load)

// Utility function to shuffle an array
function shuffle(array) {
  let currentIndex = array.length
  while (currentIndex != 0) {
    let randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex--
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
  }
}

let COUNT = 128 // New value for more particles
let TEXTURE_WIDTH = COUNT ** 2 // This will automatically update based on the COUNT value

// Main Sketch class
export default class Sketch {
  constructor(options) {
    // Initialize scene, renderer, and camera
    this.scene = new THREE.Scene()
    this.container = options.dom
    this.width = this.container.offsetWidth
    this.height = this.container.offsetHeight
    this.renderer = new THREE.WebGLRenderer()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(this.width, this.height)
    this.renderer.setClearColor(0xEEEDF0, 1)
    this.container.appendChild(this.renderer.domElement)

    // Set up camera and controls
    this.camera = new THREE.PerspectiveCamera(30, this.width / this.height, 0.1, 10)
    this.camera.position.set(0, 0, 2)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.time = 0

    // Set up loaders
    const THREE_PATH = `https://unpkg.com/three@0.${REVISION}.x`
    this.dracoLoader = new DRACOLoader(new THREE.LoadingManager()).setDecoderPath(`${THREE_PATH}/examples/jsm/libs/draco/gltf/`)
    this.gltfLoader = new GLTFLoader()
    this.gltfLoader.setDRACOLoader(this.dracoLoader)

    this.isPlaying = true

    // Initialize all components
    this.initAll()
  }

  // Initialize all components
  async initAll() {
    this.points1 = await this.getPoints(t1)
    this.points2 = await this.getPoints(t2)

    this.initGPU()
    this.addObjects()
    this.resize()
    this.render()
    this.setupResize()
  }

  // Load image and generate points
  async getPoints(url) {
    const image = await load(url)
    let canvas = document.createElement("canvas")
    let ctx = canvas.getContext("2d", { willReadFrequently: true })
    canvas.width = COUNT
    canvas.height = COUNT
    ctx.drawImage(image, 0, 0, COUNT, COUNT)
    let data = ctx.getImageData(0, 0, COUNT, COUNT).data

    // Create a 2D array to store color data
    let array = Array.from({ length: COUNT }, () => Array(COUNT).fill(0))
    for (let i = 0; i < COUNT; i++) {
      for (let j = 0; j < COUNT; j++) {
        let position = (i + j * COUNT) * 4
        let color = data[position] / 255
        array[i][j] = color
      }
    }

    // Use Poisson Disk Sampling to generate points
    var pds = new PoissonDiskSampling({
      shape: [1, 1],
      minDistance: 1 / 400,
      maxDistance: 5 / 400,
      tries: 30,
      distanceFunction: function (point) {
        let indX = Math.floor(point[0] * COUNT)
        let indY = Math.floor(point[1] * COUNT)
        return array[indX][indY]
      },
      bias: 0
    })

    let points = pds.fill()
    points = points.filter(point => {
      let indX = Math.floor(point[0] * COUNT)
      let indY = Math.floor(point[1] * COUNT)
      return array[indX][indY] < 0.9 // Filter out points in white areas
    })
    points.sort(() => Math.random() - 0.5)
    points = points.slice(0, TEXTURE_WIDTH)

    points = points.map((point) => {
      let indX = Math.floor(point[0] * COUNT)
      let indY = Math.floor(point[1] * COUNT)
      let alpha = 1 - array[indX][indY] // Adjust alpha based on color intensity
      return [point[0], point[1], alpha]
    })

    return points
  }

  // Setup GUI settings
  setUpSettings() {
    this.settings = { progress: 0 }
    this.gui = new GUI()
    this.gui.add(this.settings, "progress", 0, 1, 0.01).onChange((val) => { })
  }

  // Setup resize event listener
  setupResize() {
    window.addEventListener("resize", this.resize.bind(this))
  }

  // Handle window resize
  resize() {
    this.width = this.container.offsetWidth
    this.height = this.container.offsetHeight
    this.renderer.setSize(this.width, this.height)
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
  }

  // Add objects to the scene
  addObjects() {
    this.material = new THREE.ShaderMaterial({
      extensions: { derivatives: "#extension GL_OES_standard_derivatives : enable" },
      side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 },
        uPositions: { value: null },
        resolution: { value: new THREE.Vector4() },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      vertexShader: vertex,
      fragmentShader: fragment,
    })

    this.geometry = new THREE.BufferGeometry()
    let count = TEXTURE_WIDTH
    let positions = new Float32Array(count * 3)
    let reference = new Float32Array(count * 2)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 5 * (Math.random() - 0.5)
      positions[i * 3 + 1] = 5 * (Math.random() - 0.5)
      positions[i * 3 + 2] = 0
      reference[i * 2] = (i % COUNT) / COUNT
      reference[i * 2 + 1] = ~~(i / COUNT) / COUNT
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    this.geometry.setAttribute("reference", new THREE.BufferAttribute(reference, 2))

    this.plane = new THREE.Points(this.geometry, this.material)
    this.scene.add(this.plane)

    // Create line geometry
    this.lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0. })
    this.lineGeometry = new THREE.BufferGeometry()
    this.linePositions = new Float32Array(count * 6) // Each line has 2 points, each with 3 coordinates
    this.lineGeometry.setAttribute("position", new THREE.BufferAttribute(this.linePositions, 3))
    this.lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial)
    this.scene.add(this.lines)
  }

  // Fill position texture with random values
  fillPositionTexture(texture) {
    const theArray = texture.image.data
    for (let k = 0, kl = theArray.length; k < kl; k += 4) {
      theArray[k + 0] = 2 * (Math.random() - 0.5)
      theArray[k + 1] = 2 * (Math.random() - 0.5)
      theArray[k + 2] = 0
      theArray[k + 3] = 1
    }
  }

  // Fill velocity texture with random values
  fillVelocityTexture(texture) {
    const theArray = texture.image.data
    for (let k = 0, kl = theArray.length; k < kl; k += 4) {
      theArray[k + 0] = 0.01 * (Math.random() - 0.5)
      theArray[k + 1] = 0.01 * (Math.random() - 0.5)
      theArray[k + 2] = 0
      theArray[k + 3] = 1
    }
  }

  // Fill position texture from points
  fillPositionTextureFromPoints(texture, points) {
    const theArray = texture.image.data
    for (let k = 0, kl = theArray.length; k < kl; k += 4) {
      let i = k / 4
      theArray[k + 0] = 2 * (points[i][0] - 0.5)
      theArray[k + 1] = -2 * (points[i][1] - 0.5)
      theArray[k + 2] = 0
      theArray[k + 3] = points[i][2]
    }
  }

  // Initialize GPU computation
  initGPU() {
    this.gpuCompute = new GPUComputationRenderer(COUNT, COUNT, this.renderer)

    const dtPosition = this.gpuCompute.createTexture()
    const dtPosition1 = this.gpuCompute.createTexture()
    const dtVelocity = this.gpuCompute.createTexture()
    this.fillPositionTextureFromPoints(dtPosition, this.points1)
    this.fillPositionTextureFromPoints(dtPosition1, this.points2)
    this.fillVelocityTexture(dtVelocity)

    const target1 = this.gpuCompute.createTexture()
    const target2 = this.gpuCompute.createTexture()
    this.fillPositionTextureFromPoints(target1, this.points1)
    this.fillPositionTextureFromPoints(target2, this.points2)

    this.velocityVariable = this.gpuCompute.addVariable("textureVelocity", fragmentShaderVelocity, dtVelocity)
    this.positionVariable = this.gpuCompute.addVariable("texturePosition", fragmentShaderPosition, dtPosition)

    this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable])
    this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable])

    this.positionUniforms = this.positionVariable.material.uniforms
    this.velocityUniforms = this.velocityVariable.material.uniforms

    this.positionUniforms["time"] = { value: 0.0 }
    this.velocityUniforms["time"] = { value: 1.0 }
    this.velocityUniforms["uTarget"] = { value: target1 }
    this.velocityVariable.wrapS = THREE.RepeatWrapping
    this.velocityVariable.wrapT = THREE.RepeatWrapping
    this.positionVariable.wrapS = THREE.RepeatWrapping
    this.positionVariable.wrapT = THREE.RepeatWrapping

    let modul = 0
    document.addEventListener("click", () => {
      if (modul == 0) {
        this.velocityUniforms["uTarget"] = { value: target2 }
        modul = 1
      } else {
        this.velocityUniforms["uTarget"] = { value: target1 }
        modul = 0
      }
    })

    this.gpuCompute.init()
  }

  // Render loop
  render() {
    if (!this.isPlaying) return
    this.time += 0.05
    this.gpuCompute.compute()
    this.positionUniforms['time'].value = this.time
    this.velocityUniforms['time'].value = this.time

    this.material.uniforms.uPositions.value = this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture
    this.material.uniforms.time.value = this.time

    // Update line positions
    const positions = this.geometry.attributes.position.array
    for (let i = 0; i < this.linePositions.length; i += 6) {
      const idx1 = Math.floor(Math.random() * (positions.length / 3)) * 3
      const idx2 = Math.floor(Math.random() * (positions.length / 3)) * 3
      this.linePositions[i] = positions[idx1]
      this.linePositions[i + 1] = positions[idx1 + 1]
      this.linePositions[i + 2] = positions[idx1 + 2]
      this.linePositions[i + 3] = positions[idx2]
      this.linePositions[i + 4] = positions[idx2 + 1]
      this.linePositions[i + 5] = positions[idx2 + 2]
    }
    this.lineGeometry.attributes.position.needsUpdate = true

    requestAnimationFrame(this.render.bind(this))
    this.renderer.render(this.scene, this.camera)
  }
}

// Initialize the Sketch
new Sketch({
  dom: document.getElementById("container"),
})
