// The material the ".str" glow layers are drawn with.
//
// Glow art is light painted on an opaque black field: the black means "add
// nothing", not "cover what is behind". So the plane adds its colour to the
// scene (src=ONE, dst=ONE) and the black contributes zero — which is the whole
// of the story as long as the scene is opaque, as the map's is.
//
// It stops being the whole story on a transparent surface (the 2D preview's
// overlay canvas), because a pixel that adds colour has to declare the coverage
// that colour implies. Colour without coverage is not a valid premultiplied
// pixel and the compositor may do anything with it.
//
// The coverage is `max(r, g, b)` of the pixel actually being written, and it has
// to be read AFTER tone mapping and the output colour-space conversion — those
// are what decide the number the blender sees. That rules out precomputing it in
// the texture: alpha is not colour-managed, so brightness moved out of an
// sRGB-encoded channel into a linear one comes back many times too bright, which
// is how a texture's near-black margin turns into a saturated hard-edged box.
// Reading it off the final fragment costs one line of shader and cannot drift
// from the colour it describes.

import {
  AddEquation,
  CustomBlending,
  MeshBasicMaterial,
  NormalBlending,
  OneFactor,
  type Texture,
} from "three";

/** The straight-alpha half of a ".str": petals, discs, anything authored with a
 *  real alpha channel. Nothing clever — it is here so both planes of a billboard
 *  are built in one place rather than as two matching literals in two files. */
export function alphaMaterial(map: Texture): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    fog: false, // see the note on fog in glowMaterial
  });
}

/** Appended to three's fragment shader, after the colour-space conversion. */
const COVERAGE = `gl_FragColor.a = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);`;

export function glowMaterial(map: Texture): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendEquation: AddEquation,
    // Coverage accumulates alongside colour. The map ignores it — its drawing
    // buffer has no alpha channel — and on the preview it is what makes the
    // result a valid premultiplied pixel.
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneFactor,
    // fog:false — effects are foreground particles RO never fogs. It also fixes
    // a real artifact: with scene.fog on, the shader mixes the WHOLE quad toward
    // the fog colour and adds it (src=ONE) even where the texture is
    // transparent, painting solid fog-coloured rectangles (e.g. the blue boxes
    // around iz_dun03's bubbles).
    fog: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <colorspace_fragment>",
      `#include <colorspace_fragment>\n\t${COVERAGE}`,
    );
  };
  // Keep the patched program out of the cache slot the unpatched one would use.
  material.customProgramCacheKey = () => "glow-coverage";
  return material;
}
