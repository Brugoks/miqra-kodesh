// Scene-owned routines and hand props. Captures live inside the five GLBs;
// other scenes do not load or interpret these motions.
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';

export function assignTabernacleRoutines(figures) {
  // A small, legible work area avoids dense rings of overlapping idle people.
  let campCount = 0;
  for (let i = 0; i < figures.length; i++) {
    if (figures[i].role.startsWith('camp-') && ++campCount > 9) { figures.splice(i, 1); i--; }
  }
  const priests = figures.filter(f => f.role === 'priest');
  priests.forEach(f => { f.activity = 'standing'; f.facing = Math.atan2(-f.x, 10 - f.z); });
  priests[0].routine = 'altar-attendant';
  // The delivery lane stays well clear of the altar, laver and other priests.
  Object.assign(priests[2], { x: -5.7, z: 15, route: [[-5.7, 15], [-5.7, 8]],
    speed: .7, dwell: 5, phase: .14, routine: 'wood-carrier', activity: 'carrying' });
  priests[3].routine = 'wash';
  priests[3].x = 1;
  priests[3].facing = -Math.PI / 2;
  priests[3].activity = 'working';
  const levites = figures.filter(f => f.role === 'levite');
  levites.forEach((f, i) => {
    f.routine = i < 2 ? 'watch' : 'perimeter';
    if (i >= 2) Object.assign(f, { route: [[f.x, 2], [f.x, 12]], speed: .75, dwell: 7 + i, phase: .17 * i });
  });
  // Give existing camp figures specific positions, preserving crowd ids and
  // count at all quality levels. The work area is east of the courtyard.
  const camp = figures.filter(f => f.role.startsWith('camp-'));
  const woman = camp.find(f => f.role === 'camp-woman');
  if (woman) Object.assign(woman, { x: -4.5, z: 33, facing: 0, routine: 'pour', activity: 'working' });
  const carriers = camp.filter(f => f !== woman).slice(0, 2);
  carriers.forEach((f, i) => Object.assign(f, { x: i ? 8 : -8, z: 31, facing: 0,
    route: [[i ? 8 : -8, 31], [i ? 8 : -8, 40]], speed: .7 + i * .06,
    phase: .22 + i * .31, dwell: 6 + i, routine: 'basket-carrier', activity: 'carrying' }));
  const speakers = camp.filter(f => f !== woman && !carriers.includes(f)).slice(0, 4);
  speakers.forEach((f, i) => Object.assign(f, { x: (i < 2 ? 3 : -2) + (i % 2 ? .65 : -.65),
    z: i < 2 ? 31 : 38, facing: i % 2 ? -Math.PI / 2 : Math.PI / 2,
    routine: 'conversation', conversationSlot: i % 2, phase: i < 2 ? 0 : .4, activity: i % 2 ? 'attending' : 'talking' }));
  // Unpaired onlookers face the gate instead of gesturing at empty space.
  const assigned = new Set([woman, ...carriers, ...speakers]);
  camp.filter(f => !assigned.has(f)).forEach((f, i) => {
    f.x = 11 + i * 1.5; f.z = 35; f.facing = Math.atan2(-f.x, 25 - f.z);
    f.routine = 'watch'; f.activity = 'standing';
  });
}

export function createTabernacleLife(THREE) {
  const resources = new Set(); const own = r => { resources.add(r); return r; };
  const clay = own(new THREE.MeshStandardMaterial({ color: 0xa56d47, roughness: .94 }));
  const wicker = own(new THREE.MeshStandardMaterial({ color: 0x9d774b, roughness: 1 }));
  const wood = own(new THREE.MeshStandardMaterial({ color: 0x67513c, roughness: .97 }));
  const water = own(new THREE.MeshStandardMaterial({ color: 0x8ab5be, transparent: true, opacity: .55, roughness: .2 }));
  const mesh = (parent, geometry, material, position = [0, 0, 0]) => {
    const object = new THREE.Mesh(own(geometry), material); object.position.fromArray(position);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  };
  function basket() {
    const g = new THREE.Group(); g.name = 'woven-carry-basket';
    mesh(g, new THREE.CylinderGeometry(.24, .18, .24, 20, 1, true), wicker, [0, -.10, 0]);
    mesh(g, new THREE.CylinderGeometry(.18, .18, .018, 20), wicker, [0, -.22, 0]);
    for (let i = 0; i < 9; i++) {
      const y = -.215 + i * .028, r = .181 + i * .007;
      mesh(g, new THREE.TorusGeometry(r, .006, 5, 24), wicker, [0, y, 0]).rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const stake = mesh(g, new THREE.CylinderGeometry(.004, .004, .24, 4), wicker, [Math.cos(a) * .212, -.1, Math.sin(a) * .212]);
      stake.rotation.z = -Math.cos(a) * .23; stake.rotation.x = Math.sin(a) * .23;
    }
    return g;
  }
  function bundle() {
    const g = new THREE.Group(); g.name = 'carried-firewood';
    for (let i = 0; i < 5; i++) {
      const log = mesh(g, new THREE.CylinderGeometry(.031, .04, .68 - (i % 2) * .07, 7), wood,
        [0, -.045 - Math.floor(i / 3) * .065, ((i % 3) - 1) * .075]); log.rotation.z = Math.PI / 2;
    }
    for (const x of [-.19, .19]) mesh(g, new THREE.TorusGeometry(.12, .008, 5, 16), wicker, [x, -.075, 0]).rotation.y = Math.PI / 2;
    return g;
  }
  function jar() {
    const g = new THREE.Group(); g.name = 'pouring-clay-jar';
    // The group's origin is the grip on the handle; neck points along +Y.
    mesh(g, new THREE.SphereGeometry(.13, 18, 12), clay, [-.10, -.10, 0]).scale.y = 1.28;
    mesh(g, new THREE.CylinderGeometry(.06, .075, .12, 16, 1, true), clay, [-.10, .07, 0]);
    mesh(g, new THREE.TorusGeometry(.061, .012, 7, 20), clay, [-.10, .13, 0]).rotation.x = Math.PI / 2;
    mesh(g, new THREE.TorusGeometry(.07, .012, 7, 20), clay, [0, -.025, 0]);
    return g;
  }
  const left = new THREE.Vector3(), right = new THREE.Vector3(), mid = new THREE.Vector3(), aim = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(1, 0, 0);
  return {
    configure(actor, model, defaults) {
      const find = name => model.animations.find(c => c.name === name);
      const clips = { ...defaults }; const record = TABERNACLE_CHARACTER_ASSETS.find(a => a.id === actor.variant.modelId);
      if (find('mixamo-idle')) clips.idle = find('mixamo-idle');
      if (find('mixamo-walk')) clips.walk = find('mixamo-walk');
      const routine = actor.placement.routine;
      let restAction = 'idle';
      if (routine?.endsWith('carrier')) {
        clips.idle = find('mixamo-carry') || clips.idle; clips.walk = find('mixamo-carryWalk') || clips.walk;
      }
      if (routine === 'pour') { clips.pour = find('mixamo-pour'); clips.idle = find('mixamo-pourRest') || clips.idle; restAction = 'idle'; }
      if (routine === 'wash') { clips.wash = find('tabernacle-wash'); restAction = 'wash'; }
      clips.talk = find('mixamo-talk2') || find('mixamo-talk');
      const stride = record?.motion?.[clips.walk?.name]?.metersPerCycle;
      return { clips: Object.fromEntries(Object.entries(clips).filter(([, c]) => c)), restAction,
        locomotion: { walkMetersPerCycle: stride || 1.3 } };
    },
    attach(actor) {
      const routine = actor.placement.routine;
      actor.life = { left: actor.root.getObjectByName('mixamorigLeftHand'), right: actor.root.getObjectByName('mixamorigRightHand') };
      actor.life.leftFinger = actor.root.getObjectByName('mixamorigLeftHandMiddle1');
      actor.life.rightFinger = actor.root.getObjectByName('mixamorigRightHandMiddle1');
      if (routine?.endsWith('carrier')) {
        actor.life.prop = routine === 'wood-carrier' ? bundle() : basket(); actor.root.add(actor.life.prop);
      }
      if (routine === 'pour') {
        actor.life.prop = jar(); actor.root.add(actor.life.prop);
        const station = new THREE.Group(); station.name = 'camp-water-basin'; station.position.set(0, 0, .67); actor.root.add(station);
        mesh(station, new THREE.CylinderGeometry(.42, .28, .20, 24, 1, true), clay, [0, .1, 0]);
        mesh(station, new THREE.CircleGeometry(.395, 24), water, [0, .17, 0]).rotation.x = -Math.PI / 2;
        actor.life.stream = mesh(actor.root, new THREE.CylinderGeometry(.005, .008, 1, 6), water);
        actor.life.stream.name = 'pouring-water'; actor.life.stream.visible = false;
      }
    },
    beforeUpdate(actor, { clock, moving }) {
      if (actor.placement.routine === 'pour') {
        const t = (clock + (actor.placement.phase || 0)) % 14;
        const active = t > 3 && t < 9;
        actor.animController.restAction = active ? 'pour' : 'idle';
        actor.animController.transitionTo(actor.animController.restAction, .55);
        return;
      }
      if (actor.placement.routine !== 'conversation' || !actor.animController.actions.talk || moving) return;
      // Paired people take turns with a quiet gap, rather than gesturing in sync.
      const t = (clock + (actor.placement.phase || 0) * 11) % 16;
      const slot = actor.placement.conversationSlot ?? 0;
      const speaking = slot ? t > 8 && t < 13 : t > 1 && t < 6;
      actor.animController.restAction = speaking ? 'talk' : 'idle';
      actor.animController.transitionTo(actor.animController.restAction, .65);
    },
    afterUpdate(actor, { reducedMotion }) {
      const life = actor.life; if (!life?.prop || !life.left || !life.right) return;
      actor.root.worldToLocal(life.left.getWorldPosition(left)); actor.root.worldToLocal(life.right.getWorldPosition(right));
      if (life.leftFinger) left.lerp(actor.root.worldToLocal(life.leftFinger.getWorldPosition(mid)), .7);
      if (life.rightFinger) right.lerp(actor.root.worldToLocal(life.rightFinger.getWorldPosition(mid)), .7);
      const routine = actor.placement.routine;
      if (routine?.endsWith('carrier')) {
        mid.copy(left).add(right).multiplyScalar(.5); life.prop.position.copy(mid);
        const width = left.distanceTo(right); life.prop.scale.x = Math.max(.65, Math.min(1.6, width / .48));
        aim.copy(left).sub(right).normalize(); life.prop.quaternion.setFromUnitVectors(axis, aim);
      } else if (routine === 'pour') {
        life.prop.position.copy(right);
        // Tip only while the captured hand is actually extended over the
        // basin. A time-only sine tipped the jar even after her arm lowered.
        const pour = THREE.MathUtils.clamp((right.z - .20) / .32, 0, 1)
          * THREE.MathUtils.clamp((right.y - .73) / .20, 0, 1);
        life.prop.rotation.set(pour * 1.35, 0, -.08);
        const lip = life.prop.localToWorld(new THREE.Vector3(-.10, .13, 0)); actor.root.worldToLocal(lip);
        const bottom = new THREE.Vector3(lip.x, .18, lip.z);
        life.stream.visible = !reducedMotion && pour > .6 && Math.hypot(lip.x, lip.z - .67) < .38;
        life.stream.position.copy(lip).add(bottom).multiplyScalar(.5);
        life.stream.scale.y = Math.max(.01, lip.y - .18);
        life.stream.quaternion.setFromUnitVectors(up, aim.copy(lip).sub(bottom).normalize());
      }
      life.prop.updateMatrixWorld(true);
    },
    dispose() { resources.forEach(r => r.dispose()); resources.clear(); },
  };
}
