/* @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {MeshStandardMaterial} from 'three/src/materials/MeshStandardMaterial.js';
import {Mesh} from 'three/src/objects/Mesh.js';

import {$lazyLoadGLTFInfo} from '../../../features/scene-graph/material.js';
import {$materials, $switchVariant, Model} from '../../../features/scene-graph/model.js';
import {$correlatedObjects} from '../../../features/scene-graph/three-dom-element.js';
import {$scene} from '../../../model-viewer-base.js';
import {ModelViewerElement} from '../../../model-viewer.js';
import {CorrelatedSceneGraph} from '../../../three-components/gltf-instance/correlated-scene-graph.js';
import {timePasses, waitForEvent} from '../../../utilities.js';
import {assetPath, loadThreeGLTF} from '../../helpers.js';



const expect = chai.expect;

const ASTRONAUT_GLB_PATH = assetPath('models/Astronaut.glb');
const KHRONOS_TRIANGLE_GLB_PATH =
    assetPath('models/glTF-Sample-Models/2.0/Triangle/glTF/Triangle.gltf');
const CUBES_GLTF_PATH = assetPath('models/cubes.gltf');

suite('scene-graph/model', () => {
  suite('Model', () => {
    test('creates a "default" material, when none is specified', async () => {
      const threeGLTF = await loadThreeGLTF(KHRONOS_TRIANGLE_GLB_PATH);
      const model = new Model(CorrelatedSceneGraph.from(threeGLTF));

      expect(model.materials.length).to.be.eq(1);
      expect(model.materials[0].name).to.be.eq('Default');
    });

    test.skip('exposes a list of materials in the scene', async () => {
      // TODO: This test is skipped because [$correlatedObjects] can contain
      // unused materials, because it can contain a base material and the
      // derived material (from assignFinalMaterial(), if for instance
      // vertexTangents are used) even if only the derived material is assigned
      // to a mesh. These extras make the test fail. We may want to remove these
      // unused materials from [$correlatedObjects] at which point this test
      // will pass, but it's not hurting anything.
      const threeGLTF = await loadThreeGLTF(ASTRONAUT_GLB_PATH);
      const materials: Set<MeshStandardMaterial> = new Set();

      threeGLTF.scene.traverse((object) => {
        if ((object as Mesh).isMesh) {
          const material = (object as Mesh).material;
          if (Array.isArray(material)) {
            material.forEach(
                (material) => materials.add(material as MeshStandardMaterial));
          } else {
            materials.add(material as MeshStandardMaterial);
          }
        }
      });

      const model = new Model(CorrelatedSceneGraph.from(threeGLTF));

      const collectedMaterials = new Set<MeshStandardMaterial>();

      model.materials.forEach((material) => {
        for (const threeMaterial of material[$correlatedObjects] as
             Set<MeshStandardMaterial>) {
          collectedMaterials.add(threeMaterial);
          expect(materials.has(threeMaterial)).to.be.true;
        }
      });

      expect(collectedMaterials.size).to.be.equal(materials.size);
    });

    suite('Model Variants', () => {
      test('Switch variant and lazy load', async () => {
        const threeGLTF = await loadThreeGLTF(CUBES_GLTF_PATH);
        const model = new Model(CorrelatedSceneGraph.from(threeGLTF));
        expect(model[$materials][2][$correlatedObjects]).to.be.null;
        expect(model[$materials][2][$lazyLoadGLTFInfo]).to.be.ok;

        await model[$switchVariant]('Yellow Red');

        expect(model[$materials][2][$correlatedObjects]).to.not.be.null;
        expect(model[$materials][2][$lazyLoadGLTFInfo]).to.not.be.ok;
      });

      test(
          'Switch back to default variant does not change correlations',
          async () => {
            const threeGLTF = await loadThreeGLTF(CUBES_GLTF_PATH);
            const model = new Model(CorrelatedSceneGraph.from(threeGLTF));

            const sizeBeforeSwitch =
                model[$materials][0][$correlatedObjects]!.size;

            await model[$switchVariant]('Yellow Yellow');
            // Switches back to default.
            await model[$switchVariant]('Purple Yellow');

            expect(model[$materials][0][$correlatedObjects]!.size)
                .equals(sizeBeforeSwitch);
          });

      test(
          'Switching variant when model has no variants has not effect',
          async () => {
            const threeGLTF = await loadThreeGLTF(KHRONOS_TRIANGLE_GLB_PATH);
            const model = new Model(CorrelatedSceneGraph.from(threeGLTF));

            const threeMaterial =
                model[$materials][0][$correlatedObjects]!.values().next().value;
            const sizeBeforeSwitch =
                model[$materials][0][$correlatedObjects]!.size;
            await model[$switchVariant]('Does not exist');

            expect(
                model[$materials][0][$correlatedObjects]!.values().next().value)
                .equals(threeMaterial);
            expect(model[$materials][0][$correlatedObjects]!.size)
                .equals(sizeBeforeSwitch);
          });
    });

    suite('Model e2e test', () => {
      let element: ModelViewerElement;
      let model: Model;
      setup(async () => {
        element = new ModelViewerElement();
      });

      teardown(() => {
        document.body.removeChild(element);
      });

      const loadModel = async (src: string) => {
        element.src = src;
        document.body.insertBefore(element, document.body.firstChild);
        await waitForEvent(element, 'load');

        model = element.model!;
      };

      test('getMaterialByName returns material when name exists', async () => {
        await loadModel(CUBES_GLTF_PATH);
        const material = model.getMaterialByName('red')!;
        expect(material).to.be.ok;
        expect(material.name).to.be.equal('red');
      });

      test(
          'getMaterialByName returns null when name does not exists',
          async () => {
            await loadModel(CUBES_GLTF_PATH);
            const material = model.getMaterialByName('does-not-exist')!;
            expect(material).to.be.null;
          });

      suite('Intersecting', () => {
        test('materialFromPoint returns material', async () => {
          await loadModel(ASTRONAUT_GLB_PATH);

          const material = element.materialFromPoint(
              element[$scene].width / 2, element[$scene].height / 2)!;

          expect(material).to.be.ok;
        });

        test(
            'materialFromPoint returns null when intersect fails', async () => {
              await loadModel(ASTRONAUT_GLB_PATH);

              await timePasses(1000);

              const material = element.materialFromPoint(
                  element[$scene].width, element[$scene].height)!;
              expect(material).to.be.null;
            });
      });
    });
  });
});
