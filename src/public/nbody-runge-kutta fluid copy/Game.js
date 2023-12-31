import * as THREE from "/modules/three.module.js";

class Game {
  constructor(scene) {
    this.scene = scene;
    this.particles = null;
    this.particlePositions = [];
    this.particleVelocities = []; // New property for particle velocities
    this.numParticles = 1000; // You can adjust this numbert
    this.timescale = 0.01;
    this.dampingFactor = 0.7;
    this.cylinderRadius = 3;
    this.cylinderHeight = 4;
    this.gravity = new THREE.Vector3(0, -9000, 0); // Gravity pointing downwards
    this.createParticles();
    this.createCylinder();
  }
  createCylinder() {
    const geometry = new THREE.CylinderGeometry(
      this.cylinderRadius,
      this.cylinderRadius,
      this.cylinderHeight,
      32
    );
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      wireframe: false,
      transparent: true,
      opacity: 0.5,
      side: THREE.BackSide,
    });
    const cylinder = new THREE.Mesh(geometry, material);
    this.scene.add(cylinder);
  }
  createParticles() {
    // Create an instanced buffer geometry
    const geometry = new THREE.InstancedBufferGeometry();
    const baseGeometry = new THREE.IcosahedronGeometry(0.05, 3); // 0.05 radius and no subdivision

    geometry.index = baseGeometry.index;
    geometry.attributes.position = baseGeometry.attributes.position;
    geometry.attributes.uv = baseGeometry.attributes.uv;

    // Instanced attributes
    const offsets = [];
    const colors = [];

    for (let i = 0; i < this.numParticles; i++) {
      const x = (Math.random() * 2 - 1) * 1;
      const y = (Math.random() * 2 - 1) * 1;
      const z = (Math.random() * 2 - 1) * 1;

      offsets.push(x, y, z);
      colors.push(Math.random(), Math.random(), Math.random());

      this.particlePositions.push(new THREE.Vector3(x, y, z));

      const vx = 0;
      const vy = 0;
      const vz = 0;

      this.particleVelocities.push(new THREE.Vector3(vx, vy, vz)); // Store initial velocity
    }

    // Add instanced attributes to geometry
    geometry.setAttribute(
      "offset",
      new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3)
    );
    geometry.setAttribute(
      "color",
      new THREE.InstancedBufferAttribute(new Float32Array(colors), 3)
    );

    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 offset;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position + offset, 1.0 );
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4( vColor, 1.0 );
        }
      `,
    });

    this.particles = new THREE.Mesh(geometry, material);
    this.particles.frustumCulled = true;
    this.scene.add(this.particles);
  }
  computeForces(particle) {
    const r = new THREE.Vector3();
    const forceAccumulator = new THREE.Vector3();

    for (let j = 0; j < this.numParticles; j++) {
      if (particle === this.particlePositions[j]) continue;

      const position_j = this.particlePositions[j];
      r.subVectors(particle, position_j);

      const distance = r.length();

      // If particles are too close, ensure a minimum distance to avoid extremely high forces
      if (distance < 0.05) continue;

      // Skip far away particles
      if (distance > 0.5) continue;

      // Inverse distance force magnitude for repulsion, capped to avoid too large values
      const forceMagnitude = THREE.MathUtils.clamp(1 / distance, 0, 5);

      r.normalize().multiplyScalar(forceMagnitude);
      forceAccumulator.add(r);
    }
    return forceAccumulator;
  }
  handleCylinderCollision() {
    const restitution = .8; // adjust this value between 0 and 1
    for (let i = 0; i < this.numParticles; i++) {
      const position = this.particlePositions[i];
      const velocity = this.particleVelocities[i];

      // Handle cylindrical boundary (sides of the cylinder)
      const radialDistance = Math.sqrt(
        position.x * position.x + position.z * position.z
      );
      if (radialDistance + 0.05 > this.cylinderRadius) {
        const correctionFactor = this.cylinderRadius - radialDistance;
        const radialDirection = new THREE.Vector3(
          position.x,
          0,
          position.z
        ).normalize();
        position.sub(radialDirection.multiplyScalar(correctionFactor));

        // Reflect the velocity with restitution
        const normal = radialDirection;
        const vAlongNormal = velocity.clone().projectOnVector(normal);
        velocity
          .sub(vAlongNormal)
          .add(vAlongNormal.negate().multiplyScalar(restitution));
        velocity.multiplyScalar(this.dampingFactor);
      }

      // Handle top and bottom of the cylinder
      if (position.y + 0.05 > this.cylinderHeight / 2) {
        position.y = this.cylinderHeight / 2 - 0.05;
        velocity.y *= -1;
        velocity.multiplyScalar(this.dampingFactor);
      } else if (position.y - 0.05 < -this.cylinderHeight / 2) {
        position.y = -this.cylinderHeight / 2 + 0.05;
        velocity.y *= -1;
        velocity.multiplyScalar(this.dampingFactor);
      }
    }
  }

  handleCollisions() {
    for (let i = 0; i < this.numParticles; i++) {
      const position_i = this.particlePositions[i];
      for (let j = i + 1; j < this.numParticles; j++) {
        const position_j = this.particlePositions[j];

        const distance = position_i.distanceTo(position_j);
        const collisionThreshold = 0.1; // 2 times the radius of each particle

        if (distance < collisionThreshold) {
          const collisionResponse = 0.5 * (collisionThreshold - distance);

          const normal = position_j.clone().sub(position_i).normalize();
          position_i.sub(normal.clone().multiplyScalar(collisionResponse));
          position_j.add(normal.multiplyScalar(collisionResponse));

          const velocity_i = this.particleVelocities[i];
          const velocity_j = this.particleVelocities[j];

          // Velocity components along the normal
          const vAlongNormal_i = velocity_i.clone().projectOnVector(normal);
          const vAlongNormal_j = velocity_j.clone().projectOnVector(normal);

          // Update velocities after collision
          velocity_i.sub(vAlongNormal_i).add(vAlongNormal_j);
          velocity_j.sub(vAlongNormal_j).add(vAlongNormal_i);
        }
      }
    }
  }
  computeWallForces(position) {
    const forceAccumulator = new THREE.Vector3();

    // Side walls
    const radialDistance = Math.sqrt(
      position.x * position.x + position.z * position.z
    );
    if (radialDistance < this.cylinderRadius) {
      const penetrationDepth = this.cylinderRadius - radialDistance;
      const radialDirection = new THREE.Vector3(
        position.x,
        0,
        position.z
      ).normalize();
      const forceMagnitude = THREE.MathUtils.clamp(
        5 * (1 / penetrationDepth),
        0,
        15
      );
      forceAccumulator.sub(radialDirection.multiplyScalar(forceMagnitude));
    }

    // Top and bottom walls
    if (position.y > this.cylinderHeight / 2) {
      const penetrationDepth = position.y - this.cylinderHeight / 2;
      const forceMagnitude = THREE.MathUtils.clamp(
        5 * (1 / penetrationDepth),
        0,
        10
      );
      forceAccumulator.y -= forceMagnitude;
    } else if (position.y < -this.cylinderHeight / 2) {
      const penetrationDepth = -this.cylinderHeight / 2 - position.y;
      const forceMagnitude = THREE.MathUtils.clamp(
        5 * (1 / penetrationDepth),
        0,
        10
      );
      forceAccumulator.y += forceMagnitude;
    }

    return forceAccumulator;
  }
  update() {
    const offsets = this.particles.geometry.attributes.offset.array;

    const dt = 0.0001; // assuming unit time step
    const half_dt = dt * 0.5;

    this.handleCollisions(); // Call the function to handle collisions

    this.handleCylinderCollision();

    for (let i = 0; i < this.numParticles; i++) {
      const position = this.particlePositions[i].clone();
      const velocity = this.particleVelocities[i].clone();

      // 1st evaluation
      const k1_v = this.computeForces(position)
        .add(this.computeWallForces(position))
        .divideScalar(this.timescale);
      const k1_p = velocity.clone();

      // 2nd evaluation
      const k2_v = this.computeForces(position.addScaledVector(k1_p, half_dt))
        .add(this.computeWallForces(position.addScaledVector(k1_p, half_dt)))
        .divideScalar(this.timescale);
      const k2_p = velocity.addScaledVector(k1_v, half_dt);

      // 3rd evaluation
      const k3_v = this.computeForces(position.addScaledVector(k2_p, half_dt))
        .add(this.computeWallForces(position.addScaledVector(k2_p, half_dt)))
        .divideScalar(this.timescale);
      const k3_p = velocity.addScaledVector(k2_v, half_dt);

      // 4th evaluation
      const k4_v = this.computeForces(position.addScaledVector(k3_p, dt))
        .add(this.computeWallForces(position.addScaledVector(k3_p, dt)))
        .divideScalar(this.timescale);
      const k4_p = velocity.addScaledVector(k3_v, dt);

      // Update velocity
      velocity.addScaledVector(
        k1_v.add(k2_v.multiplyScalar(2)).add(k3_v.multiplyScalar(2)).add(k4_v),
        dt / 6
      );
      this.particleVelocities[i].copy(velocity);

      // Update position
      position.addScaledVector(
        k1_p.add(k2_p.multiplyScalar(2)).add(k3_p.multiplyScalar(2)).add(k4_p),
        dt / 6
      );
      this.particlePositions[i].copy(position);

      this.particleVelocities[i].add(this.gravity.clone().multiplyScalar(dt));

      // Update instanced attribute data
      const index = i * 3;
      offsets[index] = position.x;
      offsets[index + 1] = position.y;
      offsets[index + 2] = position.z;
    }

    this.particles.geometry.attributes.offset.needsUpdate = true;
  }
}

export { Game };
