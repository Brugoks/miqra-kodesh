import { createTableau, wave } from './sceneTableau';
import { COMMON_POSES } from './tableauPoses';
import { groundAt } from './bethlehemDimensions';

// Everyday craft is interpretive scenery, separate from the Nativity episodes.
// Keep the basket fitted to the hands; an unrelated capture would break contact.
export function createBethlehemDomesticLife(THREE, { root, motionLibrary }) {
  const x = -29, z = -4.4, y = groundAt(x, z);
  return createTableau(THREE, {
    root, name: 'bethlehem-basket-maker', focus: [x, y, z], floorAt: groundAt,
    drawDistance: 55, motionLibrary,
    cast: [{
      id: 'basket-maker', model: 'human-artisan', position: [x, y, z],
      target: [x, z + 2], pose: 'weave', principal: true,
      hold: [{ bone: 'LeftHand', build: ({ THREE, own, material }, { bone }) => {
        const basket = new THREE.Group();
        const centre = bone('LeftHand').clone().add(bone('RightHand')).multiplyScalar(0.5);
        const bowl = new THREE.Mesh(own(new THREE.CylinderGeometry(0.19, 0.11, 0.2, 16, 1, true)), material('reed'));
        bowl.position.y = -0.08;
        basket.add(bowl);
        for (let i = 0; i < 6; i++) {
          const ring = new THREE.Mesh(own(new THREE.TorusGeometry(0.115 + i * 0.014, 0.009, 4, 16)), material('timber'));
          ring.rotation.x = Math.PI / 2;
          ring.position.y = -0.17 + i * 0.037;
          basket.add(ring);
        }
        basket.position.copy(centre);
        basket.userData.aimed = true;
        basket.userData.at = centre;
        return basket;
      } }],
    }],
    poses: {
      weave: (t) => {
        // Smoothly alternate weaving and inspecting the work over twelve seconds.
        const work = Math.max(0, wave(t, 1));
        const hand = wave(t, 8) * work;
        return {
          ...COMMON_POSES.listen(t), spineLean: 12 + work * 4, headPitch: 18 + work * 8,
          left: { armFlex: 28, armAbduct: 10, foreArmFlex: 72 },
          right: { armFlex: 29 + hand * 3, armAbduct: 9, foreArmFlex: 73 + hand * 5 },
          fingerCurl: 35,
        };
      },
    },
    props: ({ addMesh }) => {
      addMesh(new THREE.CylinderGeometry(0.23, 0.22, 0.08, 12), 'timber', [x, y + 0.42, z - 0.08]);
      for (const dx of [-0.14, 0.14]) for (const dz of [-0.14, 0.14])
        addMesh(new THREE.CylinderGeometry(0.025, 0.035, 0.38, 5), 'timber', [x + dx, y + 0.19, z - 0.08 + dz]);
      return {};
    },
  });
}
