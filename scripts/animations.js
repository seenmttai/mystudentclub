/**
 * EXTENDED ANIMATIONS LIBRARY
 * Imported from Standard TalkingHead Configuration
 */

// ==========================================================================
// 1. POSES (Body Stances)
// ==========================================================================
export const poses = {
    'straight': {
        standing: true,
        props: {
            'Hips.position': { x: 0, y: 0.989, z: 0.001 }, 'Hips.rotation': { x: 0.047, y: 0.007, z: -0.007 },
            'Spine.rotation': { x: -0.143, y: -0.007, z: 0.005 }, 'Spine1.rotation': { x: -0.043, y: -0.014, z: 0.012 },
            'Neck.rotation': { x: 0.048, y: -0.003, z: 0.012 }, 'Head.rotation': { x: 0.05, y: -0.02, z: -0.017 },
            'LeftArm.rotation': { x: 1.275, y: 0.544, z: -0.092 }, 'LeftForeArm.rotation': { x: 0, y: 0, z: 0.302 },
            'RightArm.rotation': { x: 1.313, y: -0.424, z: 0.131 }, 'RightForeArm.rotation': { x: 0, y: 0, z: -0.317 },
            'LeftUpLeg.rotation': { x: -0.077, y: -0.058, z: 3.126 }, 'RightUpLeg.rotation': { x: -0.083, y: -0.032, z: 3.124 },
            'LeftHand.rotation': { x: 0, y: -0.2, z: 0 }, 'RightHand.rotation': { x: 0, y: 0.2, z: 0 }
        }
    },
    'relaxed': { // Weight on one leg
        standing: true,
        props: {
            'Hips.position': { x: 0, y: 1, z: 0 }, 'Hips.rotation': { x: -0.036, y: 0.09, z: 0.135 },
            'Spine.rotation': { x: 0.076, y: -0.035, z: 0.01 }, 'Neck.rotation': { x: 0.034, y: -0.051, z: -0.075 },
            'LeftArm.rotation': { x: 1.343, y: 0.177, z: -0.153 }, 'RightArm.rotation': { x: 1.3, y: -0.2, z: 0.1 },
            'LeftUpLeg.rotation': { x: -0.095, y: -0.058, z: -3.338 }, 'RightUpLeg.rotation': { x: -0.502, y: 0.362, z: 3.153 }
        }
    },
    'crossed': { // Arms crossed
        standing: true,
        props: {
            'LeftArm.rotation': { x: 1.0, y: 0.5, z: -0.5 }, 'LeftForeArm.rotation': { x: -1.5, y: 0, z: 0 },
            'RightArm.rotation': { x: 1.0, y: -0.5, z: 0.5 }, 'RightForeArm.rotation': { x: -1.5, y: 0, z: 0 },
            'Hips.rotation': { x: 0, y: 0, z: 0 }
        }
    }
};

// ==========================================================================
// 2. MOODS (Idle Behaviors)
// ==========================================================================
export const moods = {
    neutral: {
        baseline: { eyesLookDown: 0.05, mouthSmile: 0.02 },
        anims: [
            { name: 'breathing', loop: -1, dt: [1500, 1500], vs: { chestInhale: [0.5, 0], 'Neck.rotation': [{ x: 0.02 }, { x: 0 }] } },
            { name: 'blink', loop: -1, delay: [2000, 8000], dt: [50, 100, 50], vs: { eyeBlinkLeft: [1, 1, 0], eyeBlinkRight: [1, 1, 0] } },
            { name: 'shift', loop: -1, delay: [5000, 10000], dt: [2000], vs: { pose: ['straight', 'relaxed'] } },
            { name: 'saccade', loop: -1, delay: [1000, 4000], dt: [100], vs: { eyesRotateY: [[-0.1, 0.1]] } }
        ]
    },
    stern: { // For the strict interviewer
        baseline: { browInnerUp: 0.1, browDownLeft: 0.3, browDownRight: 0.3, mouthFrownLeft: 0.2, mouthFrownRight: 0.2 },
        anims: [
            { name: 'breathing', loop: -1, dt: [2000, 2000], vs: { chestInhale: [0.4, 0] } },
            { name: 'blink', loop: -1, delay: [1000, 5000], dt: [50, 100, 50], vs: { eyeBlinkLeft: [1, 1, 0], eyeBlinkRight: [1, 1, 0] } },
            { name: 'scowl', loop: -1, delay: [3000, 8000], dt: [1000, 2000, 1000], vs: { browDownLeft: [0.6, 0.6, 0.3], browDownRight: [0.6, 0.6, 0.3] } },
            { name: 'arms', loop: -1, delay: [10000, 20000], dt: [1000], vs: { pose: ['crossed', 'straight'] } }
        ]
    }
};

// ==========================================================================
// 3. EXPRESSIONS & GESTURES (Emoji Triggers)
// ==========================================================================
export const emojis = {
    // POSITIVE
    '😊': { dt: [500, 1500, 500], vs: { mouthSmile: [0.6, 0.6, 0], browInnerUp: [0.4, 0.4, 0], eyeSquintLeft: [0.5, 0.5, 0] } },
    '👍': { dt: [500, 1000, 500], vs: { gesture: [['thumbup', 2], null] } }, // Requires gesture logic in main class
    '👌': { dt: [500, 1000, 500], vs: { gesture: [['ok', 2], null] } },

    // NEGATIVE / STERN
    '😐': { dt: [500, 2000], vs: { pose: ['straight'], browInnerUp: [0], mouthPressLeft: [0.4], mouthPressRight: [0.4] } },
    '😠': { dt: [500, 1500, 500], vs: { browDownLeft: [1, 1, 0], browDownRight: [1, 1, 0], mouthFrownLeft: [0.7, 0.7, 0] } },
    '👎': { dt: [500, 1000, 500], vs: { gesture: [['thumbdown', 2], null] } },
    '🤦': { dt: [1000, 2000], vs: { gesture: [['facepalm', 2], null] } },
    '😤': { dt: [500, 500], vs: { chestInhale: [1, 0], noseSneerLeft: [0.7, 0], noseSneerRight: [0.7, 0] } },

    // CONVERSATIONAL
    '🤔': { dt: [500, 2000, 500], vs: { browDownLeft: [0.5, 0.5, 0], eyesRotateY: [-0.4, -0.4, 0], headRotateZ: [0.1, 0.1, 0] } },
    '🤷': { dt: [1000, 1000], vs: { gesture: [['shrug', 2], null] } },
    '👋': { dt: [500, 1000], vs: { gesture: [['handup', 2], null] } },
    '👀': { dt: [200, 1000, 200], vs: { eyesRotateX: [0.3, 0.3, 0], browInnerUp: [0.8, 0.8, 0] } },
    '🤨': { dt: [500, 1500, 500], vs: { browOuterUpRight: [1, 1, 0], browDownLeft: [0.5, 0.5, 0] } },

    // EMPHASIS
    '❗️': { dt: [200, 500, 200], vs: { headRotateX: [0.2, 0.2, 0], browInnerUp: [0.7, 0.7, 0] } },
    '❓': { dt: [500, 1000, 500], vs: { headRotateY: [0.1, 0.1, 0], headRotateZ: [0.1, 0.1, 0], browInnerUp: [0.6, 0.6, 0] } },

    // SPECIAL
    '❌': { dt: [500, 500], vs: { headRotateY: [-0.3, 0.3, -0.3, 0] } }, // Shake head no
    '✅': { dt: [500, 500], vs: { headRotateX: [0.2, -0.1, 0.2, 0] } }   // Nod head yes
};

// Helper for gestures (Hardcoded keyframe data for the Main Class to consume)
export const gestures = {
    'handup': {
        'LeftShoulder.rotation': { x: 1.5, y: 0.2, z: -1.5 }, 'LeftArm.rotation': { x: 1.5, y: -0.6, z: 1 }, 'LeftForeArm.rotation': { x: -0.8, y: -0.4, z: 1.5 }, 'LeftHand.rotation': { x: -0.5, y: -0.2, z: 0 }
    },
    'shrug': {
        'LeftShoulder.rotation': { x: 1.7, y: 0.1, z: -1.4 }, 'LeftArm.rotation': { x: 1.1, y: -0.4, z: -0.4 }, 'LeftForeArm.rotation': { x: 1.4, y: 0.1, z: 1.5 },
        'RightShoulder.rotation': { x: 1.7, y: -0.1, z: 1.4 }, 'RightArm.rotation': { x: 1.1, y: 0.4, z: 0.4 }, 'RightForeArm.rotation': { x: 1.4, y: -0.1, z: -1.5 }
    },
    'thumbup': {
        'LeftArm.rotation': { x: 1.5, y: -0.6, z: 1 }, 'LeftForeArm.rotation': { x: -0.4, y: 0.2, z: 1.5 },
        'LeftHand.rotation': { x: -0.2, y: -0.5, z: -0.2 }, // Requires fist morph + thumb bone logic in main
    }
};