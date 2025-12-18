/**
 * ANIMATIONS LIBRARY
 * Optimized for Ready Player Me Full Body Avatars
 */

// ==========================================================================
// 1. BODY POSES (Base Posture)
// ==========================================================================
export const poses = {
    'straight': {
        standing: true,
        props: {
            'Hips.position': { x: 0, y: 0.98, z: 0 },
            'Hips.rotation': { x: 0, y: 0, z: 0 },
            'Spine.rotation': { x: -0.1, y: 0, z: 0 },
            'Spine1.rotation': { x: -0.05, y: 0, z: 0 },
            'Neck.rotation': { x: 0.05, y: 0, z: 0 },
            'Head.rotation': { x: 0.05, y: 0, z: 0 },
            'LeftArm.rotation': { x: 1.3, y: 0.1, z: -0.1 },
            'LeftForeArm.rotation': { x: 0, y: 0, z: 0.3 },
            'RightArm.rotation': { x: 1.3, y: -0.1, z: 0.1 },
            'RightForeArm.rotation': { x: 0, y: 0, z: -0.3 },
            'LeftUpLeg.rotation': { x: 0, y: 0, z: 3.1 },
            'RightUpLeg.rotation': { x: 0, y: 0, z: 3.1 },
            'LeftHand.rotation': { x: 0, y: -0.2, z: 0 },
            'RightHand.rotation': { x: 0, y: 0.2, z: 0 }
        }
    },
    'relaxed': {
        standing: true,
        props: {
            'Hips.position': { x: 0, y: 0.97, z: 0 },
            'Hips.rotation': { x: 0, y: -0.05, z: 0.05 },
            'Spine.rotation': { x: -0.05, y: 0, z: -0.02 },
            'Neck.rotation': { x: 0.05, y: 0.05, z: 0 },
            'LeftArm.rotation': { x: 1.4, y: 0.1, z: -0.1 },
            'RightArm.rotation': { x: 1.25, y: -0.2, z: 0.1 },
            'RightForeArm.rotation': { x: 0.1, y: 0, z: -0.4 },
            'LeftUpLeg.rotation': { x: 0.1, y: 0, z: 3.0 },
            'RightUpLeg.rotation': { x: -0.1, y: 0, z: 3.14 }
        }
    }
};

// ==========================================================================
// 2. MOODS (The "Alive" Logic)
// ==========================================================================
export const moods = {
    neutral: {
        baseline: { eyesLookDown: 0.05 },
        anims: [
            // 1. Natural Breathing (Chest & slight shoulder movement)
            {
                name: 'breathing',
                loop: -1,
                dt: [1500, 1500], // Inhale, Exhale
                vs: {
                    chestInhale: [0.6, 0],
                    'Neck.rotation': [{ x: 0.02 }, { x: 0 }], // Slight head nod with breath
                    'LeftShoulder.rotation': [{ z: -1.6 }, { z: -1.65 }], // Shoulders rise slightly
                    'RightShoulder.rotation': [{ z: 1.6 }, { z: 1.65 }]
                }
            },
            // 2. Eye Blinking (Randomized)
            {
                name: 'blink',
                loop: -1,
                delay: [500, 4000], // Random wait between blinks
                dt: [50, 100, 50], // Close, Closed, Open
                vs: {
                    eyeBlinkLeft: [1, 1, 0],
                    eyeBlinkRight: [1, 1, 0]
                }
            },
            // 3. Saccades (Eyes darting slightly - simulates thinking/looking)
            {
                name: 'saccades',
                loop: -1,
                delay: [1000, 3000],
                dt: [100, 1000, 100],
                vs: {
                    eyesRotateY: [[-0.2, 0.2], [-0.2, 0.2], 0], // Look left/right then center
                    eyesRotateX: [[-0.1, 0.1], [-0.1, 0.1], 0]  // Look up/down then center
                }
            },
            // 4. Weight Shifting (Subtle body sway)
            {
                name: 'sway',
                loop: -1,
                delay: [5000, 10000],
                dt: [3000],
                vs: {
                    pose: ['straight', 'relaxed'] // Shift between poses smoothly
                }
            }
        ]
    }
};

// ==========================================================================
// 3. EMOJIS (Full Facial Expressions)
// ==========================================================================
export const emojis = {
    // HAPPY / AGREEMENT
    '😊': {
        name: 'happy', dt: [500, 1500, 500], vs: {
            mouthSmile: [0.6, 0.6, 0],
            browInnerUp: [0.4, 0.4, 0],
            eyeSquintLeft: [0.5, 0.5, 0],
            eyeSquintRight: [0.5, 0.5, 0],
            headRotateX: [0.1, 0.1, 0] // Nod up
        }
    },
    '😁': {
        name: 'grin', dt: [500, 1500, 500], vs: {
            mouthSmile: [0.8, 0.8, 0],
            jawOpen: [0.1, 0.1, 0],
            eyeSquintLeft: [0.7, 0.7, 0],
            eyeSquintRight: [0.7, 0.7, 0]
        }
    },
    '👍': {
        name: 'nod', dt: [300, 300, 300], vs: {
            headRotateX: [0.15, -0.05, 0],
            mouthSmile: [0.3, 0.3, 0]
        }
    },

    // THINKING / LISTENING
    '🤔': {
        name: 'think', dt: [500, 2000, 500], vs: {
            browDownLeft: [0.5, 0.5, 0],
            browOuterUpRight: [0.5, 0.5, 0],
            mouthPucker: [0.4, 0.4, 0],
            eyesRotateY: [-0.3, -0.3, 0], // Look away
            headRotateZ: [0.05, 0.05, 0] // Tilt head
        }
    },
    '🤨': {
        name: 'skeptical', dt: [500, 1500, 500], vs: {
            browInnerUp: [0, 0, 0],
            browDownRight: [0.6, 0.6, 0],
            browOuterUpLeft: [0.6, 0.6, 0],
            mouthRollLower: [0.3, 0.3, 0]
        }
    },

    // NEGATIVE / CONCERN
    '😞': {
        name: 'sad', dt: [1000, 2000, 1000], vs: {
            browInnerUp: [0.8, 0.8, 0],
            mouthFrownLeft: [0.6, 0.6, 0],
            mouthFrownRight: [0.6, 0.6, 0],
            headRotateX: [-0.15, -0.15, 0], // Look down
            eyesRotateX: [-0.2, -0.2, 0]
        }
    },
    '😡': {
        name: 'angry', dt: [500, 2000, 500], vs: {
            browDownLeft: [1, 1, 0],
            browDownRight: [1, 1, 0],
            mouthShrugUpper: [0.4, 0.4, 0],
            eyeWideLeft: [0.5, 0.5, 0],
            eyeWideRight: [0.5, 0.5, 0]
        }
    },

    // SURPRISE
    '😮': {
        name: 'shock', dt: [200, 1000, 500], vs: {
            jawOpen: [0.4, 0.4, 0],
            browInnerUp: [0.8, 0.8, 0],
            eyeWideLeft: [0.7, 0.7, 0],
            eyeWideRight: [0.7, 0.7, 0],
            headRotateX: [0.1, 0.1, 0] // Head back
        }
    }
};