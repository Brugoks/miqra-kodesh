// One staged moment at a time, for a scene with a list of events.
//
// A scene's events (its manifest `events`) are each a stage built on
// sceneTableau.js. Only one is staged at a time: the rest keep their props
// hidden and build their cast only when first staged. This is the part every
// such scene shares — which is staged, handing it the models, updating it,
// asking it what is in a walker's way, disposing of them all — and what the
// scene route reaches through `built.setEpisode`. buildCapernaum.js keeps its
// own director, because its moments also change the building (the hole in the
// roof exists in one of them).

export function createEpisodes(stages) {
  const entries = new Map(Object.entries(stages));
  let episode = null;

  function setEpisode(id) {
    episode = entries.has(id) ? id : null;
    for (const [key, stage] of entries) {
      stage.setActive(key === episode);
      if (key !== episode) stage.group.visible = false;
    }
    return episode;
  }
  const staged = () => (episode ? entries.get(episode) : null);

  return {
    ids: [...entries.keys()],
    setEpisode,
    getEpisode: () => episode,
    getStage: (id) => entries.get(id) || null,
    // Every stage keeps the models, and the staged one builds from them.
    acceptAssets(assets) {
      for (const stage of entries.values()) stage.acceptAssets(assets);
    },
    update(options) {
      staged()?.update(options);
    },
    queryClearance(...args) {
      return staged()?.queryClearance(...args) || { collides: false, pushX: 0, pushZ: 0 };
    },
    dispose() {
      for (const stage of entries.values()) stage.dispose();
      entries.clear();
    },
  };
}
