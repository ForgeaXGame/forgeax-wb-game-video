import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { computeFrame } from './scene';

test('computeFrame places camera in front at a sane distance', () => {
  const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
  const size = new THREE.Vector3(1, 2, 1);
  const f = computeFrame(cam, sphere, size);
  expect(f.target.y).toBeCloseTo(1, 5);
  expect(f.camPos.z).toBeGreaterThan(f.target.z);
  expect(f.far).toBeGreaterThan(f.near);
});
