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

import * as THREE from '../../node_modules/three/build/three.module.js';

/** This function converts the output of the OpenCascade 
 * Mesh Data Callback to three.js BufferGeometry */
export default function ConvertGeometry(meshData) {
    if (!meshData) { console.error("Mesher returned false..."); return null; }
    // Accumulate data across faces into a single array
    let vertices = [], triangles = [], normals = [], colors = [], uvs = [], uv1s = [], vInd = 0, globalFaceIndex = 0;
    let faceMetaData = [];
    meshData[0].forEach((face) => {
        let faceMeta = {};

        // Copy Vertices into three.js Vector3 List
        vertices.push(...face.vertex_coord);
        normals .push(...face.normal_coord);
        uvs     .push(...face.    uv_coord);
        uv1s    .push(...face.    oc_uv_coord);
        
        // Starting Triangle Index (inclusive)
        faceMeta.start = triangles.length / 3;
      
        // Sort Triangles into a three.js Face List
        for (let i = 0; i < face.tri_indexes.length; i += 3) {
            triangles.push(
                face.tri_indexes[i + 0] + vInd,
                face.tri_indexes[i + 1] + vInd,
                face.tri_indexes[i + 2] + vInd);
        }
        vInd += face.vertex_coord.length / 3;

        // Ending Triangle Index (exclusive)
        faceMeta.end = triangles.length / 3;
        faceMeta.index = globalFaceIndex++;
        faceMeta.is_planar = face.is_planar;
        faceMeta.average = face.average;
        faceMeta.normal = [face.normal_coord[0], face.normal_coord[1], face.normal_coord[2]];
        faceMeta.uvBounds = [face.UMin, face.UMax, face.VMin, face.VMax];
        faceMetaData.push(faceMeta);
    });

    // Compile the connected vertices and faces into a geometry object
    let geometry = new THREE.BufferGeometry();
    geometry.setIndex(triangles);
    geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
    geometry.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
    geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
    geometry.setAttribute( 'uv' , new THREE.Float32BufferAttribute( uvs, 2 ) );
    geometry.setAttribute( 'uv1' , new THREE.Float32BufferAttribute( uv1s, 2 ) );
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    // Add Edges to Object
    // This wild complexity is what allows all of the lines to be drawn in a single draw call
    // AND highlighted on a per-edge basis by the mouse hover.  On the docket for refactoring.
    let lineVertices = []; let globalEdgeIndices = [];
    let curGlobalEdgeIndex = 0; let edgeVertices = 0;
    let globalEdgeMetadata = {}; globalEdgeMetadata[-1] = { start: -1, end: -1 };
    meshData[1].forEach((edge) => {
      let edgeMetadata = {};
      edgeMetadata.localEdgeIndex = edge.edge_index;
      edgeMetadata.start = globalEdgeIndices.length;
      for (let i = 0; i < edge.vertex_coord.length-3; i += 3) {
        lineVertices.push(new THREE.Vector3(edge.vertex_coord[i    ],
                                            edge.vertex_coord[i + 1],
                                            edge.vertex_coord[i + 2]));
                  
        lineVertices.push(new THREE.Vector3(edge.vertex_coord[i     + 3],
                                            edge.vertex_coord[i + 1 + 3],
                                            edge.vertex_coord[i + 2 + 3]));
        globalEdgeIndices.push(curGlobalEdgeIndex); globalEdgeIndices.push(curGlobalEdgeIndex);
        edgeVertices++;
      }
      edgeMetadata.end = globalEdgeIndices.length-1;
      globalEdgeMetadata[curGlobalEdgeIndex] = edgeMetadata;
      curGlobalEdgeIndex++;
    });

    let lineGeometry = new THREE.BufferGeometry().setFromPoints(lineVertices);
    let lineColors = []; for ( let i = 0; i < lineVertices.length; i++ ) { lineColors.push( 0, 0, 0 ); }
    lineGeometry.setAttribute( 'color', new THREE.Float32BufferAttribute( lineColors, 3 ) );

    let line = new THREE.LineSegments(lineGeometry, window.world.lineMaterial);
    line.globalEdgeIndices = globalEdgeIndices;
    line.globalEdgeMetadata = globalEdgeMetadata;
    line.name = "Model Edges";
    line.lineColors = lineColors;
    line.frustumCulled = false;
    line.layers.set(2);
    // End Adding Edges

    // A minor bit of dependency inversion, but for the greater good
    let mesh = new THREE.Mesh(geometry, window.world.shapeMaterial);
    mesh.material.color.setRGB(0.5, 0.5, 0.5);
    mesh.faceMetadata = faceMetaData;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.add(line);
    return mesh;
}
