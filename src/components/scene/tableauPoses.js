// Poses shared by Capernaum's staged moments: sitting, kneeling, standing and
// listening, the ways a crowd holds itself. Each is a function of time in the
// sceneHumanClips pose-frame vocabulary (angles in degrees; limbs are absolute
// directions in the actor's own frame, 0 straight down, 90 straight ahead), and
// each motion is a whole number of cycles of the baked loop (`wave`), so the
// loop never jumps.
//
// Poses that belong to a single moment — the rebuke, the cast net, the hand
// that lifts a woman off her mat — live with that moment.

import { wave } from './sceneTableau.js';

export const SEATED_LEGS = { leftLeg: { thighFlex: 88, shinFlex: 2 }, rightLeg: { thighFlex: 86, shinFlex: -3 } };
export const KNEEL_LEGS = {
  leftLeg: { thighFlex: -12, shinFlex: -95, ankleBend: -20 },
  rightLeg: { thighFlex: -12, shinFlex: -95, ankleBend: -20 },
};
// Sitting on the floor with the knees drawn up: the hips a hand's breadth
// off the ground, the thighs rising to the knees and the shins falling back
// to the feet.
export const FLOOR_SIT = {
  hipsHeight: 0.13,
  leftLeg: { thighFlex: 138, shinFlex: 30, ankleBend: 12 },
  rightLeg: { thighFlex: 134, shinFlex: 26, ankleBend: 10 },
};
const RELAXED = { armFlex: -2, armAbduct: 5, foreArmFlex: 12 };

export const COMMON_POSES = {
  // --- seated on a bench or a seat ---
  listen: (t) => ({
    seated: true,
    ...SEATED_LEGS,
    spineLean: 5 + wave(t, 1) * 0.6,
    headPitch: 2,
    left: { armFlex: 16, armAbduct: 6, foreArmFlex: 70 },
    right: { armFlex: 14, armAbduct: 6, foreArmFlex: 68 },
    fingerCurl: 30,
  }),
  // Forearms on the knees, straining to hear.
  leanIn: (t) => ({
    seated: true,
    ...SEATED_LEGS,
    spineLean: 22 + wave(t, 1) * 0.8,
    headPitch: -10,
    left: { armFlex: 46, armAbduct: 8, foreArmFlex: 62 },
    right: { armFlex: 44, armAbduct: 8, foreArmFlex: 60 },
    fingerCurl: 40,
  }),
  // Pulled back from something, hands up by the chest.
  startled: (t) => {
    const flinch = Math.max(0, wave(t, 4)) * 1.5;
    return {
      seated: true,
      ...SEATED_LEGS,
      spineLean: -11 - flinch,
      headPitch: -3,
      left: { armFlex: 34 + flinch, armAbduct: 16, foreArmFlex: 118 },
      right: { armFlex: 30 + flinch, armAbduct: 18, foreArmFlex: 112 },
      fingerCurl: 12,
    };
  },
  // Seated with folded arms and the chin down: unconvinced.
  skeptic: (t) => ({
    seated: true,
    ...SEATED_LEGS,
    spineLean: -6 + wave(t, 1) * 0.5,
    headPitch: 10,
    left: { armFlex: 22, armAbduct: -1, foreArmFlex: 98, foreArmAbduct: -44 },
    right: { armFlex: 24, armAbduct: -1, foreArmFlex: 94, foreArmAbduct: -42 },
    fingerCurl: 55,
  }),
  // Seated and turned to the man beside, one hand making a point.
  dispute: (t) => {
    const beat = wave(t, 6);
    return {
      seated: true,
      ...SEATED_LEGS,
      spineLean: 8,
      spineYaw: 14,
      headPitch: -2,
      left: { armFlex: 16, armAbduct: 6, foreArmFlex: 68 },
      right: { armFlex: 38 + beat * 8, armAbduct: 14, foreArmFlex: 96 + beat * 6 },
      fingerCurl: 16,
    };
  },

  // --- sitting on the floor ---
  floorListen: (t) => ({
    ...FLOOR_SIT,
    spineLean: 12 + wave(t, 1) * 0.6,
    headPitch: -4,
    // Arms loosely round the knees.
    left: { armFlex: 58, armAbduct: 10, foreArmFlex: 88, foreArmAbduct: -22 },
    right: { armFlex: 56, armAbduct: 10, foreArmFlex: 90, foreArmAbduct: -24 },
    fingerCurl: 35,
  }),
  floorLean: (t) => ({
    ...FLOOR_SIT,
    spineLean: 24 + wave(t, 1) * 0.8,
    headPitch: -12,
    left: { armFlex: 62, armAbduct: 8, foreArmFlex: 70 },
    right: { armFlex: 60, armAbduct: 8, foreArmFlex: 72 },
    fingerCurl: 40,
  }),

  // --- kneeling ---
  kneelListen: (t) => ({
    kneeling: true,
    ...KNEEL_LEGS,
    spineLean: 7 + wave(t, 1) * 0.5,
    headPitch: -6,
    left: { armFlex: 10, armAbduct: 4, foreArmFlex: 50 },
    right: { armFlex: 10, armAbduct: 4, foreArmFlex: 48 },
    fingerCurl: 25,
  }),
  kneelStartled: (t) => {
    const flinch = Math.max(0, wave(t, 5, 1)) * 1.5;
    return {
      kneeling: true,
      ...KNEEL_LEGS,
      spineLean: -6 - flinch,
      headPitch: -4,
      left: { armFlex: 30 + flinch, armAbduct: 18, foreArmFlex: 110 },
      right: { armFlex: 26 + flinch, armAbduct: 18, foreArmFlex: 104 },
      fingerCurl: 10,
    };
  },
  // Kneeling and bowed, hands together.
  kneelBowed: (t) => ({
    kneeling: true,
    ...KNEEL_LEGS,
    spineLean: 24 + wave(t, 1) * 0.8,
    headPitch: 16,
    left: { armFlex: 34, armAbduct: 2, foreArmFlex: 96, foreArmAbduct: -40 },
    right: { armFlex: 34, armAbduct: 2, foreArmFlex: 96, foreArmAbduct: -40 },
    fingerCurl: 18,
  }),

  // --- standing ---
  standListen: (t) => ({
    spineLean: 3 + wave(t, 1) * 0.4,
    headPitch: 4,
    left: { armFlex: 8, armAbduct: 3, foreArmFlex: 64, foreArmAbduct: -34 },
    right: { armFlex: 8, armAbduct: 3, foreArmFlex: 66, foreArmAbduct: -36 },
    fingerCurl: 30,
  }),
  standIdle: (t) => ({
    spineLean: 1 + wave(t, 1) * 0.4,
    headPitch: 3,
    leftLeg: { thighFlex: 3, shinFlex: 0 },
    rightLeg: { thighFlex: -2, shinFlex: -1 },
    left: RELAXED,
    right: { ...RELAXED, foreArmFlex: 16 },
    fingerCurl: 18,
  }),
  // Craning past the shoulder in front, weight forward.
  crane: (t) => ({
    spineLean: 14 + wave(t, 2) * 1.2,
    spineYaw: -6,
    headPitch: -5,
    leftLeg: { thighFlex: 6, shinFlex: 2 },
    rightLeg: { thighFlex: -5, shinFlex: -3 },
    left: { armFlex: 2, armAbduct: 3.5, foreArmFlex: 14, foreArmAbduct: -2 },
    right: { armFlex: 1, armAbduct: 3.5, foreArmFlex: 12, foreArmAbduct: -2 },
    fingerCurl: 20,
  }),
  // Pressed in a crowd: arms tucked, weight shifting.
  press: (t) => ({
    spineLean: 9 + wave(t, 2) * 0.8,
    spineYaw: 5,
    headPitch: -6,
    leftLeg: { thighFlex: 4, shinFlex: 1 },
    rightLeg: { thighFlex: -3, shinFlex: -2 },
    left: { armFlex: 6, armAbduct: 3.5, foreArmFlex: 44, foreArmAbduct: -16 },
    right: { armFlex: 5, armAbduct: 3.5, foreArmFlex: 40 + wave(t, 2), foreArmAbduct: -14 },
    fingerCurl: 22,
  }),
  // Talking with one hand.
  standTalk: (t) => {
    const beat = wave(t, 5);
    return {
      spineLean: 2,
      spineYaw: 6,
      headPitch: 2,
      leftLeg: { thighFlex: 3, shinFlex: 0 },
      rightLeg: { thighFlex: -3, shinFlex: -1 },
      left: RELAXED,
      right: { armFlex: 30 + beat * 7, armAbduct: 12, foreArmFlex: 84 + beat * 6 },
      fingerCurl: 14,
    };
  },
  // Arms folded, weight back.
  stern: (t) => ({
    spineLean: -3 + wave(t, 1) * 0.4,
    headPitch: 6,
    left: { armFlex: 24, armAbduct: -2, foreArmFlex: 100, foreArmAbduct: -46 },
    right: { armFlex: 26, armAbduct: -2, foreArmFlex: 96, foreArmAbduct: -44 },
    fingerCurl: 55,
  }),
  // On his feet and backing off, hands up.
  recoil: (t) => {
    const flinch = Math.max(0, wave(t, 4, 0.4)) * 2;
    return {
      spineLean: -13 - flinch,
      headPitch: -2,
      leftLeg: { thighFlex: 12, shinFlex: -4 },
      rightLeg: { thighFlex: -14, shinFlex: -8 },
      left: { armFlex: 42 + flinch, armAbduct: 22, foreArmFlex: 116 },
      right: { armFlex: 38 + flinch, armAbduct: 24, foreArmFlex: 110 },
      fingerCurl: 8,
    };
  },
  // Holding a lamp up in the right hand, palm under it.
  holdLamp: (t) => ({
    spineLean: 3 + wave(t, 1) * 0.4,
    headPitch: 2,
    left: RELAXED,
    right: { armFlex: 48 + wave(t, 2) * 1.5, armAbduct: 10, foreArmFlex: 96, handTwist: -70 },
    fingerCurl: 30,
  }),
  // Leaning on a staff held in the right hand.
  onStaff: (t) => ({
    spineLean: 12 + wave(t, 1) * 0.6,
    headPitch: -4,
    leftLeg: { thighFlex: 6, shinFlex: 4 },
    rightLeg: { thighFlex: -4, shinFlex: 0 },
    left: RELAXED,
    right: { armFlex: 30, armAbduct: 14, foreArmFlex: 58 },
    fingerCurl: 70,
  }),
};
