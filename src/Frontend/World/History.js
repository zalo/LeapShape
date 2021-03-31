import * as THREE from '../../../node_modules/three/build/three.module.js';

/** With every action, an object and its anti-object are created. The two are time-reversals of each other.
 *  When a shape is created into the "shapeObjects", its symmetric "Remove-" shape is added to "undoObjects"
 *  When it is undone, the shape is moved to "redoObjects" and the "Remove-" shape is destroyed.
 *  When it is redone, the shape is moved back to "shapeObjects", and a "Remove-" shape is added to "undoObjects" all over again.
 *  If an object with equivalent name already exists, then it is replaced, and the older object is banished to its shadow realm.
 *  This is the cycle.  Of Birth and Destruction.  Change and Stagnation.  The flow and ebb of time.  This is the Undo/Redo system. */
class History {
    
    /** Initialize the Modelling History + Undo/Redo Shortcuts
     * @param {World} world */
    constructor(world) {
        // Store a reference to the World
        this.world = world;

        this.shapeObjects = new THREE.Group();
        this.undoObjects  = new THREE.Group();
        this.redoObjects  = new THREE.Group();
        this.removeCmd = "Remove-";

        this.curState = 0;
        window.history.pushState(this.curState, null, null);

        this.world.scene.add(this.shapeObjects);

        // Handle Keyboard events
        window.addEventListener("keydown", event => {
            if (event.isComposing || event.keyCode === 229) { return; }
            if (event.ctrlKey || event.metaKey) {
                if (event.key == "z") { this.Undo(); }
                if (event.key == "y") { this.Redo(); }
            }
        });

        // Handle Browser Back/Forth Events
        window.onpopstate = (event) => {
            // Check to see if this state comes from the past or future
            while (typeof event.state === "number" && event.state < this.curState && (this.undoObjects.children.length > 0)) {
                this.InternalUndo();
            }
            while (typeof event.state === "number" && event.state > this.curState && (this.redoObjects.children.length > 0)) {
                this.InternalRedo();
            }
            this.world.dirty = true;
        };
    }

    Undo() { if((this.undoObjects.children.length > 0)) { history.go(-1); } }
    Redo() { if((this.redoObjects.children.length > 0)) { history.go( 1); } }
    InternalUndo() { if (this.undoObjects.children.length > 0) { this.processDoCommand( this.shapeObjects, this.undoObjects, this.redoObjects); this.curState -= 1; } }
    InternalRedo() { if (this.redoObjects.children.length > 0) { this.processDoCommand( this.shapeObjects, this.redoObjects, this.undoObjects); this.curState += 1; } }

    /** Dequeue a do element, and queue its reverse into the ...reverse queue
     * @param {THREE.Object3D} drawingLayer 
     * @param {THREE.Object3D} commandLayer
     * @param {THREE.Object3D} reverseLayer */ 
    processDoCommand(drawingLayer, commandLayer, reverseLayer) {
        // Deactivate the current tool since we're messing up their state
        if (this.world.parent.tools.activeTool) { this.world.parent.tools.activeTool.deactivate(); }

        let command = commandLayer.children[commandLayer.children.length - 1];
        if (command) {
            // If this item's name starts with the removeCmd...
            if (command.name.startsWith(this.removeCmd)) {
                // Find this item and "delete" it...
                let condemnedName = command.name.substring(this.removeCmd.length);
                let condemnedStroke = null;
                for (let i = 0; i < drawingLayer.children.length; i++){
                    if (drawingLayer.children[i].name == condemnedName) { condemnedStroke = drawingLayer.children[i]; }
                }
                if (condemnedStroke) {
                    reverseLayer.add(condemnedStroke);
                } else {
                    console.error("Undo/Redo History is corrupt; " +
                        "couldn't find " + condemnedName + " to delete it...");
                }
                commandLayer.remove(command);
            } else {
                // Check and see if this item already exists
                let strokeToReplace = null; let i = 0;
                for (i = 0; i < drawingLayer.children.length; i++){
                    if (drawingLayer.children[i].name == command.name) { strokeToReplace = drawingLayer.children[i]; } //break;
                }
                if (strokeToReplace) {
                    // If it *does* exist, just replace it
                    reverseLayer.add(strokeToReplace);
                    //if (strokeToReplace.undoObjects) {
                    //    // If this is a union object, take all of its children
                    //    for (let i = 0; i < strokeToReplace.undoObjects.length; i++) {
                    //        strokeToReplace.add(strokeToReplace.undoObjects[i]);
                    //    }
                    //}

                    // Use 'replaceWith' to preserve layer order!
                    drawingLayer.add(command);
                    //if (command.undoObjects) {
                    //    // If this is a union object, take all of its children
                    //    for (let i = 0; i < command.undoObjects.length; i++) {
                    //        drawingLayer.add(command.undoObjects[i]);
                    //    }
                    //}
                } else {
                    // If it does not exist, create it
                    drawingLayer.add(command);
  
                    let removeCommand = new THREE.Group();
                    removeCommand.name = this.removeCmd + command.name;
                    reverseLayer.add(removeCommand);
                }
            }
        }
    }

    /** Store this item's current state in the Undo Queue 
     * @param {THREE.Object3D} item Object to add into the scene
     * @param {THREE.Object3D} toReplace Object(s) to replace with item */
    addToUndo(item, toReplace) {
        //if (toReplace && toReplace.length) {
        //    // To Replace is an Array of Shapes
        //    let arrayReplace = new THREE.Group();
        //    arrayReplace.name = toReplace[0].name;
        //    //toReplace[0].name += " Unioned";
        //    for (let q = 0; q < toReplace.length; q++) { arrayReplace.add(toReplace[q]); }
        //    arrayReplace.undoShapes = toReplace;
        //    this.undoObjects.add(arrayReplace);
        //    item.name = arrayReplace.name;
        //    item.undoShapes = toReplace;
        //}else 
        if (toReplace) {
            this.undoObjects.add(toReplace);
            item.name = toReplace.name;
        }else{
            let removeCommand = new THREE.Group();
            removeCommand.name = this.removeCmd + item.name;
            this.undoObjects.add(removeCommand);
        }

        this.shapeObjects.add(item);

        this.curState += 1;
        window.history.pushState(this.curState, null, null);

        // Clear the redo "history" (it's technically invalid now...)
        this.ClearRedoHistory();
    }

    /** Removes this shape from the scene */
    removeShape(item) {
        this.undoObjects.add(item);

        let removeCommand = new THREE.Group();
        removeCommand.name = this.removeCmd + item.name;
        this.redoObjects.add(removeCommand);

        this.curState += 1;
        window.history.pushState(this.curState, null, null);
        // Clear the redo "history" (it's technically invalid now...)
        this.ClearRedoHistory();
    }

    /** Clear the Redo Queue */
    ClearRedoHistory() { this.redoObjects.clear(); }
    /** Clear the Undo Queue */
    ClearUndoHistory() { this.undoObjects.clear(); }
    /** Undo all actions up to this point (can be redone individually) */
    ClearAll() {
      for (let i = 0; i < this.undoObjects.length; i++) { this.Undo(); }
    }

}

export { History };
