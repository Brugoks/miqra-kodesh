// Real bind-pose data (translation, rotation, parent name) for the two
// shipped MakeHuman-derived rigs, extracted directly from the GLBs at
// public/assets/scenes/shared/humans/. Used to build a synthetic but
// faithful skeleton in sceneHumanClips.test.js, so the clip-authoring math
// is verified against the actual bind poses the shipped characters use —
// including the fact that they genuinely differ (the artisan's hips sit 9
// degrees off true, the villager's spine 21 degrees straighter than the
// artisan's), which is exactly the thing the absolute-targeting technique
// in sceneHumanClips.js has to be robust to. Regenerate by decoding the
// glTF JSON chunk of each .glb directly if the shipped models ever change.
export const BIND_POSES = {
  "artisan": {
    "mixamorig:Hips": {
      "t": [
        -0.001589,
        0.986657,
        0.010563
      ],
      "r": [
        0.080872,
        -0.009682,
        -0.009467,
        0.996633
      ],
      "parent": "HumanRig"
    },
    "mixamorig:Spine": {
      "t": [
        0,
        0.091856,
        0
      ],
      "r": [
        -0.183035,
        0.006827,
        0.010754,
        0.983024
      ],
      "parent": "mixamorig:Hips"
    },
    "mixamorig:Spine1": {
      "t": [
        0,
        0.101351,
        0
      ],
      "r": [
        -0.103916,
        0.00185,
        0.000193,
        0.994584
      ],
      "parent": "mixamorig:Spine"
    },
    "mixamorig:Spine2": {
      "t": [
        0,
        0.135415,
        0
      ],
      "r": [
        0.346682,
        0,
        0,
        0.937983
      ],
      "parent": "mixamorig:Spine1"
    },
    "mixamorig:Neck": {
      "t": [
        0,
        0.217883,
        0
      ],
      "r": [
        -0.291338,
        0,
        0,
        0.95662
      ],
      "parent": "mixamorig:Spine2"
    },
    "mixamorig:Head": {
      "t": [
        0.002423,
        0.036598,
        0.018623
      ],
      "r": [
        0.158886,
        0.00496,
        0.00671,
        0.987262
      ],
      "parent": "mixamorig:Neck"
    },
    "mixamorig:LeftShoulder": {
      "t": [
        0.064695,
        0.184139,
        0.013614
      ],
      "r": [
        0.451005,
        0.192251,
        -0.726818,
        0.48101
      ],
      "parent": "mixamorig:Spine2"
    },
    "mixamorig:RightShoulder": {
      "t": [
        -0.063409,
        0.174821,
        0.018393
      ],
      "r": [
        0.461278,
        -0.235011,
        0.700688,
        0.490947
      ],
      "parent": "mixamorig:Spine2"
    },
    "mixamorig:LeftArm": {
      "t": [
        0,
        0.140682,
        0
      ],
      "r": [
        0.137569,
        -0.282325,
        -0.097527,
        0.944381
      ],
      "parent": "mixamorig:LeftShoulder"
    },
    "mixamorig:RightArm": {
      "t": [
        0,
        0.137099,
        0
      ],
      "r": [
        0.174272,
        0.312534,
        0.104197,
        0.927952
      ],
      "parent": "mixamorig:RightShoulder"
    },
    "mixamorig:LeftForeArm": {
      "t": [
        0,
        0.253329,
        0
      ],
      "r": [
        0.259447,
        0.054115,
        0.290449,
        0.919455
      ],
      "parent": "mixamorig:LeftArm"
    },
    "mixamorig:RightForeArm": {
      "t": [
        0,
        0.253329,
        0
      ],
      "r": [
        0.258507,
        -0.052974,
        -0.291286,
        0.919522
      ],
      "parent": "mixamorig:RightArm"
    },
    "mixamorig:LeftHand": {
      "t": [
        0,
        0.262106,
        0
      ],
      "r": [
        0.016569,
        -0.039068,
        -0.06366,
        0.997069
      ],
      "parent": "mixamorig:LeftForeArm"
    },
    "mixamorig:RightHand": {
      "t": [
        0,
        0.262106,
        0
      ],
      "r": [
        0.03369,
        0.151874,
        0.068921,
        0.985418
      ],
      "parent": "mixamorig:RightForeArm"
    },
    "mixamorig:LeftUpLeg": {
      "t": [
        0.11388,
        -0.052078,
        -0.009035
      ],
      "r": [
        0.029763,
        -0.117758,
        -0.990495,
        0.064545
      ],
      "parent": "mixamorig:Hips"
    },
    "mixamorig:RightUpLeg": {
      "t": [
        -0.109109,
        -0.055938,
        -0.004389
      ],
      "r": [
        0.048331,
        0.119575,
        0.99063,
        0.044928
      ],
      "parent": "mixamorig:Hips"
    },
    "mixamorig:LeftLeg": {
      "t": [
        0,
        0.422339,
        0
      ],
      "r": [
        -0.057021,
        0.021979,
        -0.008204,
        0.998097
      ],
      "parent": "mixamorig:LeftUpLeg"
    },
    "mixamorig:RightLeg": {
      "t": [
        0,
        0.422339,
        0
      ],
      "r": [
        -0.057021,
        -0.021989,
        0.008202,
        0.998097
      ],
      "parent": "mixamorig:RightUpLeg"
    },
    "mixamorig:LeftFoot": {
      "t": [
        0,
        0.445763,
        0
      ],
      "r": [
        0.609146,
        0.065986,
        0.098628,
        0.78413
      ],
      "parent": "mixamorig:LeftLeg"
    },
    "mixamorig:RightFoot": {
      "t": [
        0,
        0.445763,
        0
      ],
      "r": [
        0.578571,
        -0.216394,
        -0.214571,
        0.756563
      ],
      "parent": "mixamorig:RightLeg"
    }
  },
  "villager": {
    "mixamorig:Hips": {
      "t": [
        0.003734,
        0.800028,
        0.023194
      ],
      "r": [
        -0.019387,
        0.016261,
        0.016501,
        0.999544
      ],
      "parent": "HumanRig"
    },
    "mixamorig:Spine": {
      "t": [
        0,
        0.111062,
        0
      ],
      "r": [
        -0.011027,
        -0.017612,
        -0.016967,
        0.99964
      ],
      "parent": "mixamorig:Hips"
    },
    "mixamorig:Spine1": {
      "t": [
        0,
        0.096993,
        0
      ],
      "r": [
        -0.008501,
        0.00186,
        1.6e-05,
        0.999962
      ],
      "parent": "mixamorig:Spine"
    },
    "mixamorig:Spine2": {
      "t": [
        0,
        0.11375,
        0
      ],
      "r": [
        0.022551,
        0,
        0,
        0.999746
      ],
      "parent": "mixamorig:Spine1"
    },
    "mixamorig:Neck": {
      "t": [
        0,
        0.133659,
        0
      ],
      "r": [
        0.025052,
        0,
        0,
        0.999686
      ],
      "parent": "mixamorig:Spine2"
    },
    "mixamorig:Head": {
      "t": [
        0.000241,
        0.056815,
        0.019545
      ],
      "r": [
        -0.025804,
        0.000659,
        0.000647,
        0.999667
      ],
      "parent": "mixamorig:Neck"
    },
    "mixamorig:LeftShoulder": {
      "t": [
        0.058259,
        0.112959,
        0.014642
      ],
      "r": [
        0.508606,
        0.263503,
        -0.721857,
        0.38834
      ],
      "parent": "mixamorig:Spine2"
    },
    "mixamorig:RightShoulder": {
      "t": [
        -0.048956,
        0.111001,
        0.012207
      ],
      "r": [
        0.528365,
        -0.285602,
        0.688759,
        0.406045
      ],
      "parent": "mixamorig:Spine2"
    },
    "mixamorig:LeftArm": {
      "t": [
        0,
        0.103994,
        0
      ],
      "r": [
        0.088839,
        -0.237278,
        -0.080551,
        0.964012
      ],
      "parent": "mixamorig:LeftShoulder"
    },
    "mixamorig:RightArm": {
      "t": [
        0,
        0.110879,
        0
      ],
      "r": [
        0.112206,
        0.268281,
        0.102164,
        0.951314
      ],
      "parent": "mixamorig:RightShoulder"
    },
    "mixamorig:LeftForeArm": {
      "t": [
        0,
        0.218642,
        0
      ],
      "r": [
        0.25445,
        0.007607,
        0.233558,
        0.938428
      ],
      "parent": "mixamorig:LeftArm"
    },
    "mixamorig:RightForeArm": {
      "t": [
        0,
        0.218642,
        0
      ],
      "r": [
        0.253694,
        -0.006444,
        -0.234379,
        0.938437
      ],
      "parent": "mixamorig:RightArm"
    },
    "mixamorig:LeftHand": {
      "t": [
        0,
        0.198462,
        0
      ],
      "r": [
        0.023588,
        -0.019377,
        -0.050464,
        0.998259
      ],
      "parent": "mixamorig:LeftForeArm"
    },
    "mixamorig:RightHand": {
      "t": [
        0,
        0.198462,
        0
      ],
      "r": [
        0.041568,
        0.130066,
        0.059003,
        0.988875
      ],
      "parent": "mixamorig:RightForeArm"
    },
    "mixamorig:LeftUpLeg": {
      "t": [
        0.086708,
        -0.044434,
        -0.002611
      ],
      "r": [
        0.064322,
        -0.018024,
        -0.997053,
        0.037736
      ],
      "parent": "mixamorig:Hips"
    },
    "mixamorig:RightUpLeg": {
      "t": [
        -0.096613,
        -0.038265,
        -0.008459
      ],
      "r": [
        0.033071,
        0.014641,
        0.996764,
        0.071788
      ],
      "parent": "mixamorig:Hips"
    },
    "mixamorig:LeftLeg": {
      "t": [
        0,
        0.340281,
        0
      ],
      "r": [
        -0.064853,
        0.012393,
        -0.018541,
        0.997646
      ],
      "parent": "mixamorig:LeftUpLeg"
    },
    "mixamorig:RightLeg": {
      "t": [
        0,
        0.340281,
        0
      ],
      "r": [
        -0.064853,
        -0.012403,
        0.01854,
        0.997645
      ],
      "parent": "mixamorig:RightUpLeg"
    },
    "mixamorig:LeftFoot": {
      "t": [
        0,
        0.35782,
        0
      ],
      "r": [
        0.585914,
        0.106686,
        0.122181,
        0.793974
      ],
      "parent": "mixamorig:LeftLeg"
    },
    "mixamorig:RightFoot": {
      "t": [
        0,
        0.35782,
        0
      ],
      "r": [
        0.551224,
        -0.258229,
        -0.233187,
        0.75835
      ],
      "parent": "mixamorig:RightLeg"
    }
  }
};
