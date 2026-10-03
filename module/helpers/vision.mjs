/**
 * Vision granted by racial skills. Nothing is saved onto tokens: the actor
 * hands Foundry a set of token changes each time its data is prepared (see
 * NoQuarterActor#applyActiveEffects), the same way an Active Effect with a
 * `token.` key would. Foundry then refreshes the character's tokens whenever
 * a racial skill is added, edited or removed, and removing the last one
 * returns the tokens to their own vision settings.
 */

const OutlineOverlayFilter = () => foundry.canvas.rendering.filters.OutlineOverlayFilter;

/**
 * Echolocation: hearing the shape of things nearby. Like Earthsense
 * (Foundry's tremorsense) it works in the dark and doesn't need a light, but
 * it's sound rather than vibration, so it stops at walls and also picks out
 * creatures that are flying.
 */
class DetectionModeEcholocation extends foundry.canvas.perception.DetectionMode {
  /** @override */
  static getDetectionFilter() {
    return (this._detectionFilter ??= OutlineOverlayFilter().create({
      outlineColor: [0.3, 0.8, 1, 1],
      knockout: true,
      wave: true,
    }));
  }

  /** @override */
  _canDetect(visionSource, target) {
    return target instanceof foundry.canvas.placeables.Token;
  }
}

/** Add the Echolocation detection mode to Foundry's list. */
export function registerVision() {
  CONFIG.Canvas.detectionModes.echolocation = new DetectionModeEcholocation({
    id: 'echolocation',
    label: 'NOQUARTER.Vision.echolocation',
    walls: true,
    angle: false,
    type: foundry.canvas.perception.DetectionMode.DETECTION_TYPES.SOUND,
  });
}

/**
 * The token changes that give an actor's tokens its forms of vision.
 * @param {Set<string>} senses   Keys of NOQUARTER.visionTypes
 * @returns {object[]}           Active Effect change data, keyed relative to the token
 */
export function visionTokenChanges(senses) {
  const changes = [];
  const change = (key, type, value) => {
    const priority = foundry.documents.ActiveEffect.implementation.CHANGE_TYPES[type]?.defaultPriority ?? 0;
    changes.push({ key, type, value, priority, phase: 'final', noQuarterVision: true });
  };
  for (const sense of senses) {
    const range = CONFIG.NOQUARTER.visionTypes[sense]?.range;
    if (!range) continue;
    switch (sense) {
      case 'darkvision':
        // Seeing in the dark: the darkvision look, and sight out to the range.
        // A token that already sees further keeps its own range.
        change('sight.visionMode', 'override', 'darkvision');
        change('sight.range', 'upgrade', range);
        change('detectionModes.basicSight.range', 'upgrade', range);
        break;
      case 'earthsense':
        change('detectionModes.feelTremor', 'override', { enabled: true, range });
        break;
      case 'echolocation':
        change('detectionModes.echolocation', 'override', { enabled: true, range });
        break;
    }
  }
  return changes;
}
