// Canvas
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;


//For background 
const bg = new Image();
bg.src = "assets/backgrounds/level1.png";
let bgLoaded = false;

bg.onload = () => bgLoaded = true;


// Global state
let currentLevel = null;
let objects = [];
let lightSource = null;
let targets = [];
let mirrors = [];
let watertanks = [];
let draggingObj = null;
let dragOffset = {x:0, y:0};

class WaterTank {
  constructor(x, y, width, height, refractionOffset = 0.5) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.refractionOffset = refractionOffset;
  }
  
  draw() {
    ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
    ctx.fillRect(this.x, this.y, this.width, this.height);
    
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
  }

  isInside(mx, my) {
    // Simple bounding box for dragging
    return Math.abs(mx - this.x) < this.width && Math.abs(my - this.y) < this.height;
  }
  
  // contains(x, y) {
  //   return x >= this.x && x <= this.x + this.width &&
  //          y >= this.y && y <= this.y + this.height;
  // }
  
  // refractLight(angle) {
  //   return angle + this.refractionOffset;
  // }
}


class Mirror {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.angle = angle * Math.PI/180;
        this.length = 150; // pure physics mirror length
    }

    get x1() {
        return this.x - Math.cos(this.angle) * this.length/2;
    }

    get y1() {
        return this.y - Math.sin(this.angle) * this.length/2;
    }

    get x2() {
        return this.x + Math.cos(this.angle) * this.length/2;
    }

    get y2() {
        return this.y + Math.sin(this.angle) * this.length/2;
    }

    isInside(mx, my) {
        const dx = mx - this.x;
        const dy = my - this.y;

        const a = -this.angle;
        const rx = dx * Math.cos(a) - dy * Math.sin(a);
        const ry = dx * Math.sin(a) + dy * Math.cos(a);

        return Math.abs(rx) < this.length/2 && Math.abs(ry) < 10;
    }

    draw() {
        ctx.strokeStyle = "cyan";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(this.x1, this.y1);
        ctx.lineTo(this.x2, this.y2);
        ctx.stroke();
    }
}


class LightSource {
  constructor(x, y, dx, dy) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
  }

  draw() {
    ctx.fillStyle = "yellow";
    ctx.beginPath();
    ctx.arc(this.x, this.y, 10, 0, Math.PI*2);
    ctx.fill();
  }
}


class Target {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.img = new Image();
    this.img.src = "assets/targets/sensor.png";
    this.hit = false;
  }

  draw() {
    ctx.drawImage(this.img, this.x - 20, this.y - 20, 40, 40);
    if (this.hit) {
      ctx.fillStyle = "lime";
      ctx.beginPath();
      ctx.arc(this.x, this.y, 5, 0, Math.PI*2);
      ctx.fill();
    }
  }
}


function reflectVector(dx, dy, nx, ny) {
  const dot = dx * nx + dy * ny;
  return {
    dx: dx - 2 * dot * nx,
    dy: dy - 2 * dot * ny
  };
}


function rayLineIntersection(ray, mirror) {
  const x1 = mirror.x1, y1 = mirror.y1;
  const x2 = mirror.x2, y2 = mirror.y2;

  const x3 = ray.x, y3 = ray.y;
  const x4 = ray.x + ray.dx * 10000;
  const y4 = ray.y + ray.dy * 10000;

  const denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
  if (denom === 0) return null;

  const t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denom;
  const u = -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3)) / denom;

  if (t >= 0 && t <= 1 && u >= 0) {
    return {
      x: x1 + t*(x2-x1),
      y: y1 + t*(y2-y1),
      dist: u
    };
  }
  return null;
}

function rayWaterTankIntersection(ray, tank) {
  const sides = [
    { x1: tank.x, y1: tank.y, x2: tank.x + tank.width, y2: tank.y, name: 'top' },
    { x1: tank.x + tank.width, y1: tank.y, x2: tank.x + tank.width, y2: tank.y + tank.height, name: 'right' },
    { x1: tank.x + tank.width, y1: tank.y + tank.height, x2: tank.x, y2: tank.y + tank.height, name: 'bottom' },
    { x1: tank.x, y1: tank.y + tank.height, x2: tank.x, y2: tank.y, name: 'left' }
  ];
  
  let closestHit = null;
  let hitSide = null;
  
  sides.forEach(side => {
    const hit = rayLineIntersection(ray, side);
    if (hit && hit.dist > 0.01 && (!closestHit || hit.dist < closestHit.dist)) {
      closestHit = hit;
      hitSide = side.name;
    }
  });
  
  if (closestHit) {
    return {
      x: closestHit.x,
      y: closestHit.y,
      dist: closestHit.dist,
      side: hitSide
    };
  }
  
  return null;
}
function castRay(source) {
  let ray = {
    x: source.x,
    y: source.y,
    dx: source.dx,
    dy: source.dy
  };

  let maxDistance = 2000;
  let safety = 0;

  ctx.strokeStyle = "yellow";
  ctx.lineWidth = 2;

  while (maxDistance > 0) {
    safety++;
    if (safety > 50) break;

    let closestHit = null;
    let closestMirror = null;
    let closestTank = null;
    let closestTarget = null;
    let hitType = null; // 'mirror', 'tank', or 'target'

    // Check mirrors
    mirrors.forEach(m => {
      const hit = rayLineIntersection(ray, m);
      if (hit && hit.dist > 0.01 && (!closestHit || hit.dist < closestHit.dist)) {
        closestHit = hit;
        closestMirror = m;
        hitType = 'mirror';
      }
    });

    // Check water tanks
    watertanks.forEach(w => {
      const hit = rayWaterTankIntersection(ray, w);
      if (hit && hit.dist > 0.01 && (!closestHit || hit.dist < closestHit.dist)) {
        closestHit = hit;
        closestTank = w;
        hitType = 'tank';
      }
    });

    // Check targets
    targets.forEach(t => {
      // Calculate distance from ray origin to target
      const dx = t.x - ray.x;
      const dy = t.y - ray.y;
      const dist = Math.hypot(dx, dy);
      
      // Project target position onto ray direction
      const dot = dx * ray.dx + dy * ray.dy;
      
      if (dot > 0) { // Target is in front of ray
        const projX = ray.x + ray.dx * dot;
        const projY = ray.y + ray.dy * dot;
        const perpDist = Math.hypot(t.x - projX, t.y - projY);
        
        // Check if ray passes within 20 pixels of target center
        if (perpDist < 20 && dist > 0.01 && (!closestHit || dist < closestHit.dist)) {
          closestHit = { x: projX, y: projY, dist: dist };
          closestTarget = t;
          hitType = 'target';
        }
      }
    });

    // If no valid collision then draw beam to infinity
    if (!closestHit || !isFinite(closestHit.dist)) {
      ctx.beginPath();
      ctx.moveTo(ray.x, ray.y);
      ctx.lineTo(ray.x + ray.dx * 1000, ray.y + ray.dy * 1000);
      ctx.stroke();
      break;
    }

    // Draw ray up to collision
    ctx.beginPath();
    ctx.moveTo(ray.x, ray.y);
    ctx.lineTo(closestHit.x, closestHit.y);
    ctx.stroke();

    // Handle different collision types
    if (hitType === 'mirror') {
      // SURFACE NORMAL for mirror reflection
      const nx = (closestMirror.y2 - closestMirror.y1);
      const ny = -(closestMirror.x2 - closestMirror.x1);
      const len = Math.hypot(nx, ny);
      const normX = nx / len;
      const normY = ny / len;

      const refl = reflectVector(ray.dx, ray.dy, normX, normY);

      ray.x = closestHit.x + refl.dx * 0.01;
      ray.y = closestHit.y + refl.dy * 0.01;
      ray.dx = refl.dx;
      ray.dy = refl.dy;

    } else if (hitType === 'tank') {
      // Apply refraction based on which side was hit
      let currentAngle = Math.atan2(ray.dy, ray.dx);
      
      // Apply different offsets based on side
      if (closestHit.side === 'top' || closestHit.side === 'bottom') {
        currentAngle += closestTank.refractionOffset;
      } else if (closestHit.side === 'left' || closestHit.side === 'right') {
        currentAngle += closestTank.refractionOffset;
      }
      
      // Convert back to dx, dy
      ray.dx = Math.cos(currentAngle);
      ray.dy = Math.sin(currentAngle);
      
      // Offset the ray slightly to avoid re-collision
      ray.x = closestHit.x + ray.dx * 0.01;
      ray.y = closestHit.y + ray.dy * 0.01;

    } else if (hitType === 'target') {
      // Target was hit - mark it and complete level
      closestTarget.hit = true;
      completeLevel();
      break; // Stop the ray
    }

    maxDistance -= closestHit.dist;
  }
}


async function completeLevel(){
  await loadLevel("levels/level2.json");
  loop();
}

//Load level

async function loadLevel(path) {
  const data = await fetch(path).then(r => r.json());

  lightSource = new LightSource(
    data.lightSource.x,
    data.lightSource.y,
    data.lightSource.dx,
    data.lightSource.dy
  );

  mirrors = data.mirrors.map(m => new Mirror(m.x, m.y, m.angle));
  targets = data.targets.map(t => new Target(t.x, t.y));
  watertanks = data.watertanks.map(w => new WaterTank(w.x, w.y, w.width, w.height));
  console.log(watertanks);
}




//Dragging Mirrors


canvas.addEventListener("mousedown", e => {
  const mx = e.offsetX, my = e.offsetY;

  mirrors.forEach(m => {
    if (m.isInside(mx, my)) {
      draggingObj = m;
      dragOffset.x = mx - m.x;
      dragOffset.y = my - m.y;
    }
  });

  watertanks.forEach( w => {
    if (w.isInside(mx, my)) {
      draggingObj = w;
      dragOffset.x = mx - w.x;
      dragOffset.y = my - w.y;
    }
  })
});

canvas.addEventListener("mousemove", e => {
  if (!draggingObj) return;

  draggingObj.x = e.offsetX - dragOffset.x;
  draggingObj.y = e.offsetY - dragOffset.y;
});

canvas.addEventListener("mouseup", () => draggingObj = null);

// Function responisble for rotation 

window.addEventListener("keydown", e => {
    if (!draggingObj) return;

    if (e.key === "a" || e.key === "A") draggingObj.angle -= 0.1;
    if (e.key === "d" || e.key === "D") draggingObj.angle += 0.1;
});



function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw background
  if (bgLoaded) {
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
} else {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

  // (optional) if using level image

  lightSource.draw();

  mirrors.forEach(m => m.draw());
  targets.forEach(t => t.draw());
  watertanks.forEach(w => w.draw());

  

  targets.forEach(t => t.hit = false); // reset

  castRay(lightSource);

  requestAnimationFrame(loop);
}


async function startGame() {
  await loadLevel("levels/level1.json");
  loop();
}

startGame();