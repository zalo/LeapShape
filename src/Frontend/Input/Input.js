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
import { MouseInput } from './MouseInput.js';
import { LeapJSInput } from './LeapJSInput.js';
import { OpenXRInput } from './OpenXRInput.js';

/**
 * This is the input abstraction object for LeapShape.
 * Mice, Touchscreens, Hands, and Controllers all 
 * produce interaction rays.
 */
class InteractionRay {
    /**
     * Construct a new interaction ray from a three.js ray.
     * @param {THREE.Ray} ray The origin and direction of the interaction ray.
     */
    constructor(ray) {
        this.ray = ray;
        this.active = false;
        this.justActivated = false;
        this.justDeactivated = false;
        this.activeMS = 0;
        this.hovering = false;
        this.lastHovering = false;
    }
}

/** This is the input abstraction for LeapShape.
 * Mouse, Touchscreen, Hands, and Controllers 
 * are routed through here as InteractionRays. */
class Input {
    
    constructor(world) {
        // Add your new input abstraction here!
        this.inputs = {
            openxr: new OpenXRInput(world, this),
            mouse : new MouseInput (world, this),
            hands : new LeapJSInput(world, this),
        };
        this.activeInput = this.inputs.mouse;
        this.ray = new InteractionRay(new THREE.Ray());
    }

    /**
     * Update the various Input Abstractions and output the active InputRay.
     */
    update() {
        for(let input in this.inputs){
            this.inputs[input].update();
            if (this.inputs[input].isActive()) {
                this.activeInput = this.inputs[input];
                this.ray = this.inputs[input].ray;
            }
        }
        return this.ray;
    }

}

export { Input, InteractionRay };
