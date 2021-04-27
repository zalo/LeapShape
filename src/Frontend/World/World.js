/**
 * Copyright 2021 Ultraleap, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as THREE from '../../../node_modules/three/build/three.module.js';
//import Stats from '../../../node_modules/three/examples/jsm/libs/stats.module.js';
import { GUI } from '../../../node_modules/three/examples/jsm/libs/dat.gui.module.js';
import { OrbitControls } from '../../../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { VRButton } from '../../../node_modules/three/examples/jsm/webxr/VRButton.js';
import { CSM } from '../../../node_modules/three/examples/jsm/csm/CSM.js';
import { CSMHelper } from '../../../node_modules/three/examples/jsm/csm/CSMHelper.js';
import { History } from "./History.js";
import { InteractionRay } from "../Input/Input.js";
import { LeapShapeRenderer } from "../main.js";
import { createDitherDepthMaterial } from '../Tools/General/ToolUtils.js';
import { LeapPinchLocomotion } from '../Input/LeapPinchLocomotion.js';

/** The fundamental set up and animation structures for 3D Visualization */
class World {

    /** Create the basic world and scenery 
     * @param {LeapShapeRenderer} parent The Parent LeapShape Renderer
     * @param {function} updateFunction */
    constructor(parent, updateFunction) {
        // sneaky leaky references for dependency inversion...
        this.parent = parent; window.world = this;

        // record browser metadata for power saving features...
        this.safari = /(Safari)/g.test( navigator.userAgent ) && ! /(Chrome)/g.test( navigator.userAgent );
        this.mobile = /(Android|iPad|iPhone|iPod|Oculus)/g.test(navigator.userAgent) || this.safari;

        // app container div
        this.container = document.getElementById('appbody');
        document.body.appendChild(this.container);
        
        // camera and world
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color( 0xeeeeee );
        //this.scene.fog = new THREE.Fog(0xffffff, 0.5, 1.3);
        this.scene.onBeforeRender = function(renderer, scene, camera) {
            if (camera.cameras && camera.cameras.length) {
                for (let i = 0; i < camera.cameras.length; i++) {
                    camera.cameras[i].layers.enableAll();
                }
            }
        }

        this.cameraWorldPosition = new THREE.Vector3(1,1,1);
        this.cameraWorldScale    = new THREE.Vector3(1,1,1);
        this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.0001, 1000 );
        this.camera.position.set( 0.1, 0.2, 0.3 );
        this.camera.layers.enableAll();
        this.cameraParent = new THREE.Group();
        this.cameraParent.add(this.camera);
        this.scene.add(this.cameraParent);
        this.camera.getWorldPosition(this.cameraWorldPosition);

        this.csmGroup = new THREE.Group();
        this.scene.add(this.csmGroup);
        this.csm = new CSM( {
            maxFar: 10,
            cascades: 2,
            //mode: "practical",
            parent: this.csmGroup,
            //shadowMapSize: 1024,
            //lightIntensity: 1.0,
            margin: 1,
            lightDirection: new THREE.Vector3( 0, -2, -1).normalize(),
            camera: this.camera
        });
        this.csm.fade = false;
        this.csm.updateFrustums();

        // ground
        let groundMat = new THREE.MeshStandardMaterial({ color: 0x7f7f7f, depthWrite: false });
        this.csm.setupMaterial(groundMat);
        this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), groundMat); //, opacity: 0 
        this.mesh.rotation.x = - Math.PI / 2;
        //this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.isGround = true;
        this.mesh.frustumCulled = false;
        this.scene.add( this.mesh );
        this.grid = new THREE.GridHelper( 2, 20, 0x000000, 0x000000 );
        this.grid.material.opacity = 0.4;
        this.grid.material.transparent = true;
        this.grid.layers.set(2);
        this.grid.frustumCulled = false;
        this.scene.add(this.grid);
        
        // light
        this.light = new THREE.HemisphereLight( 0xffffff, 0x444444 );
        this.light.position.set( 0, 0.2, 0 );
        this.scene.add( this.light );

        // renderer
        this.renderer = new THREE.WebGLRenderer( { antialias: true } );
        this.renderer.setPixelRatio( window.devicePixelRatio );
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
        if (navigator.xr) {
            navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
                if (supported) {
                    this.container.appendChild(VRButton.createButton(this.renderer));
                    this.renderer.xr.enabled = true;
                }
            });
        }
        this.renderer.setAnimationLoop( updateFunction );
        
        // orbit controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.10;
        this.controls.screenSpacePanning = true;
        this.controls.target.set( 0, 0.1, 0 );
        this.controls.update();
        window.addEventListener('resize', this._onWindowResize.bind(this), false);
        window.addEventListener('orientationchange', this._onWindowResize.bind(this), false);
        this._onWindowResize();

        // pinch controls (initialize at runtime; see LeapHandInput.js)
        this.leftPinch = null, this.rightPinch = null, this.locomotion = null;
        
        // raycaster
        this.raycaster = new THREE.Raycaster();
        this.raycaster.layers.set(0);

        // stats
        //this.stats = new Stats();
        //this.container.appendChild(this.stats.dom);

        // gui 
        //this.gui = new GUI();
        //this.params = { offset: 10 };
        //this.gui.add( this.params, 'offset').min( 1 ).max( 100 ).name( 'Far Offset' );

        // Contains both the Undo History, and the set of active shapes
        this.history = new History(this);

        this.lastTimeInteractedWith = performance.now();
        this.dirty = false;

        // Materials for the Scene
        this.shapeMaterial = new THREE.MeshStandardMaterial({
            dithering: true,
            polygonOffset: true, // Push the mesh material back for line drawing
            polygonOffsetFactor: 2.0,
            polygonOffsetUnits: 1.0
        });
        this.shapeMaterial.roughnessMap = null;
        this.shapeMaterial.metalnessMap = null;
        this.shapeMaterial.roughness = 0.75;
        this.shapeMaterial.metalness = 0.0;
        this.shapeMaterial.color.setRGB(0.5, 0.5, 0.5);
        this.csm.setupMaterial(this.shapeMaterial);
        this.selectedMaterial = this.shapeMaterial.clone();
        this.selectedMaterial.emissive.setRGB(0.0, 0.25, 0.25);
        this.csm.setupMaterial(this.selectedMaterial);
        this.previewMaterial = createDitherDepthMaterial(this);
        this.noDepthPreviewMaterial = this.selectedMaterial.clone();
        this.csm.setupMaterial(this.noDepthPreviewMaterial);
        this.basicMaterial = new THREE.MeshBasicMaterial();
        this.lineMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff, linewidth: 0.0015, vertexColors: true  });
        this.selectedLineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff, linewidth: 0.0015, vertexColors: false });
    }

    /** Update the camera and render the scene 
     * @param {InteractionRay} ray The Current Input Ray */
    update(ray) {
        this.inVR = this.renderer.xr.isPresenting;

        this.camera.getWorldPosition(this.cameraWorldPosition);
        this.raycaster.params.Line.threshold =
            0.01 * this.camera.getWorldScale(this.cameraWorldScale).x;
        
        // HACK to make Cascaded Shadow maps work at any scale...
        //this.csm.updateFrustums();
        this.csm.getBreaks();
        this.csm.initCascades();
        this.csm.updateShadowBounds();
        for (let i = 0; i < this.csm.frustums.length; i++) {
            let shadowCam = this.csm.lights[i].shadow.camera;
            shadowCam.left   *= this.cameraWorldScale.x;
            shadowCam.right  *= this.cameraWorldScale.x;
            shadowCam.top    *= this.cameraWorldScale.x;
            shadowCam.bottom *= this.cameraWorldScale.x;
            shadowCam.updateProjectionMatrix();
            this.csm.lights[i].shadow.autoUpdate = false;
            this.csm.lights[i].shadow.needsUpdate = !this.mobile;
        }
        this.csm.updateUniforms();
        this.csm.update();

        // Conserve Power, don't rerender unless the view is dirty
        if (ray.active || this.dirty) {
            this.lastTimeInteractedWith = performance.now();
        }

        // If the scene is dirty, it's been a while, or we're in VR...
        if (performance.now() - this.lastTimeInteractedWith < 2000 ||
            (this.renderer.xr && this.renderer.xr.enabled)) {
            // Manage Camera Control Schemes
            let cameraControl = !ray.alreadyActivated;
            if (this.handsAreTracking) {
                if (!this.locomotion) { this.locomotion = new LeapPinchLocomotion(this, this.leftPinch, this.rightPinch); }
                if (cameraControl) { this.locomotion.update(); }
            }
            this.controls.enabled = cameraControl && !this.handsAreTracking;
            if (this.controls.enabled) { this.controls.update(); }

            // Render the scene (Normally or in WebXR)
            this.renderer.render(this.scene, this.camera);

            // Also Render the scene to the Canvas if in WebXR
            if (this.renderer.xr.isPresenting && !this.mobile) {
                this.renderer.xr.enabled = false;
                let oldFramebuffer = this.renderer._framebuffer;
                this.renderer.state.bindXRFramebuffer( null );
                //this.renderer.setRenderTarget( this.renderer.getRenderTarget() ); // Hack #15830
                this.renderer.render(this.scene, this.camera);
                this.renderer.xr.enabled = true;
                this.renderer.state.bindXRFramebuffer(oldFramebuffer);
            }

            this.now = performance.now();
            ray.lastAlreadyActivated = ray.alreadyActivated;

            this.dirty = false;

            // If we just entered VR, offset the camera parent by the camera position
            if (this.inVR && !this.lastInVR) {
                this.cameraParent.position.copy(this.camera.position)
                    .multiplyScalar(-1.0).add(this.cameraWorldPosition);
            }

            this.lastInVR = this.inVR;
            //this.stats.update();
        } else if (performance.now() - this.lastTimeInteractedWith > 3000) {
            this.lastTimeInteractedWith += 1020; // Otherwise Update once per ~second...
        }
    }

    /** **INTERNAL**: This function recalculates the viewport based on the new window size. */
    _onWindowResize() {
        let rect = this.container.getBoundingClientRect();
        let width = rect.width, height = window.innerHeight - rect.y;

        let oldFramebuffer = this.renderer._framebuffer;
        let oldPresenting = this.renderer.xr.isPresenting;
        if (oldPresenting && !this.mobile) {
            this.renderer.xr.enabled = false;
            this.renderer.state.bindXRFramebuffer( null );
            this.renderer.xr.isPresenting = false;
        }

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.csm.updateFrustums();
        this.renderer.setSize(width, height);

        if (oldPresenting && !this.mobile) {
            this.renderer.xr.enabled = true;
            this.renderer.state.bindXRFramebuffer(oldFramebuffer);
            this.renderer.xr.isPresenting = oldPresenting;
        }

        this.dirty = true;
    }

}

export { World };
