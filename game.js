// Canvas
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;


// Global state
let currentLevel = null;

let levelTransitioning = false;
let objects = [];
let lightSource = null;
let targets = [];
let mirrors = [];
let obstacles = [];
let watertanks = [];
let raysplitters = [];
let currentLevelData = null;
let draggingObj = null;
let dragOffset = {x:0, y:0};

let bg = null;
let bgLoaded = false;
let bgm = null;



let drLight = null;
let drLightImg = null;
let drLightLoaded = false;


// let gameState = "title"; // "title" -> "intro" -> "playing"

const levelOrder = [ // intro
    "levels/level1.json",  // actual level 1
    "levels/level2.json",
    "levels/level3.json",
    "levels/level4.json",
    "levels/level5.json",
];

let currentLevelIndex = 0;


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

function drawInstructionBox() {
  if (!instructionBox) return;
  
  // Draw white background
  ctx.fillStyle = 'white';
  ctx.fillRect(instructionBox.x, instructionBox.y, instructionBox.width, instructionBox.height);
  
  // Draw black border
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 3;
  ctx.strokeRect(instructionBox.x, instructionBox.y, instructionBox.width, instructionBox.height);
  
  // Draw text
  ctx.fillStyle = 'black';
  ctx.font = '16px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  // Wrap text
  const maxWidth = instructionBox.width - (instructionBox.padding * 2);
  const words = instructionBox.text.split(' ');
  let line = '';
  let y = instructionBox.y + instructionBox.padding;
  const lineHeight = 20;
  
  words.forEach(word => {
    const testLine = line + word + ' ';
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(line, instructionBox.x + instructionBox.padding, y);
      line = word + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  });
  ctx.fillText(line, instructionBox.x + instructionBox.padding, y);
}

//Obstacle

class Obstacle {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    draw() {
        ctx.fillStyle = "rgba(34, 14, 0, 1)";
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    // For collision = treat each side as a line segment
    getSides() {
        return [
            { x1: this.x, y1: this.y, x2: this.x + this.width, y2: this.y },
            { x1: this.x + this.width, y1: this.y, x2: this.x + this.width, y2: this.y + this.height },
            { x1: this.x + this.width, y1: this.y + this.height, x2: this.x, y2: this.y + this.height },
            { x1: this.x, y1: this.y + this.height, x2: this.x, y2: this.y }
        ];
    }
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
class RaySplitter {
  constructor(x, y, width, height, splitAngle = Math.PI / 8) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.splitAngle = splitAngle; // 22.5 degrees spread for side rays
  }
  
  draw() {
    // Draw translucent purple/pink prism
    ctx.fillStyle = 'rgba(200, 100, 255, 0.4)';
    ctx.fillRect(this.x, this.y, this.width, this.height);
    
    // Draw thin black border
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
  }
  
  splitRay(ray) {
    // Get the current angle of the ray
    const currentAngle = Math.atan2(ray.dy, ray.dx);
    
    // Create 3 rays: left, center, right
    const rays = [];
    
    // Left ray
    const leftAngle = currentAngle - this.splitAngle;
    rays.push({
      x: ray.x,
      y: ray.y,
      dx: Math.cos(leftAngle),
      dy: Math.sin(leftAngle)
    });
    
    // Center ray (straight through)
    rays.push({
      x: ray.x,
      y: ray.y,
      dx: ray.dx,
      dy: ray.dy
    });
    
    // Right ray
    const rightAngle = currentAngle + this.splitAngle;
    rays.push({
      x: ray.x,
      y: ray.y,
      dx: Math.cos(rightAngle),
      dy: Math.sin(rightAngle)
    });
    
    return rays;
  }
  isInside(mx, my) {
    // Simple bounding box for dragging
    return Math.abs(mx - this.x) < this.width && Math.abs(my - this.y) < this.height;
  }
}

function raySplitterIntersection(ray, splitter) {
  const sides = [
    { x1: splitter.x, y1: splitter.y, x2: splitter.x + splitter.width, y2: splitter.y, name: 'top' },
    { x1: splitter.x + splitter.width, y1: splitter.y, x2: splitter.x + splitter.width, y2: splitter.y + splitter.height, name: 'right' },
    { x1: splitter.x + splitter.width, y1: splitter.y + splitter.height, x2: splitter.x, y2: splitter.y + splitter.height, name: 'bottom' },
    { x1: splitter.x, y1: splitter.y + splitter.height, x2: splitter.x, y2: splitter.y, name: 'left' }
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
  let insideTank = null; // Track if ray is inside a water tank

  ctx.strokeStyle = "yellow";
  ctx.lineWidth = 4;

  while (maxDistance > 0) {
    safety++;
    if (safety > 50) break;

    let closestHit = null;
    let closestMirror = null;
    let closestTank = null;
    let closestTarget = null;
    let closestSplitter = null;
    let hitType = null;

    // Check obstacles FIRST (highest priority)
    obstacles.forEach(ob => {
        ob.getSides().forEach(side => {
            const hit = rayLineIntersection(ray, side);
            if (hit && hit.dist > 0.001 && (!closestHit || hit.dist < closestHit.dist)) {
                closestHit = hit;
                hitType = "obstacle";
            }
        });
    });

    // Check mirrors
    mirrors.forEach(m => {
      const hit = rayLineIntersection(ray, m);
      if (hit && hit.dist > 0.001 && (!closestHit || hit.dist < closestHit.dist)) {
        closestHit = hit;
        closestMirror = m;
        hitType = 'mirror';
      }
    });

    // Check water tanks
    watertanks.forEach(w => {
      const hit = rayWaterTankIntersection(ray, w);
      if (hit && hit.dist > 0.001 && (!closestHit || hit.dist < closestHit.dist)) {
        closestHit = hit;
        closestTank = w;
        hitType = 'tank';
      }
    });

    // Check ray splitters
    raysplitters.forEach(s => {
      const hit = raySplitterIntersection(ray, s);
      if (hit && hit.dist > 0.001 && (!closestHit || hit.dist < closestHit.dist)) {
        closestHit = hit;
        closestSplitter = s;
        hitType = 'splitter';
      }
    });

    // Check targets
    targets.forEach(t => {
        const r = 20;

        const fx = ray.x - t.x;
        const fy = ray.y - t.y;

        const a = ray.dx * ray.dx + ray.dy * ray.dy;
        const b = 2 * (fx * ray.dx + fy * ray.dy);
        const c = (fx * fx + fy * fy) - r * r;

        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return;

        const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
        const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);

        const hitT = Math.min(t1, t2);
        if (hitT > 0.001 && (!closestHit || hitT < closestHit.dist)) {
            closestHit = {
                x: ray.x + ray.dx * hitT,
                y: ray.y + ray.dy * hitT,
                dist: hitT
            };
            closestTarget = t;
            hitType = "target";
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
    if (hitType === "obstacle") {
      // Obstacle always stops the ray
      break;

    } else if (hitType === 'mirror') {
      const nx = (closestMirror.y2 - closestMirror.y1);
      const ny = -(closestMirror.x2 - closestMirror.x1);
      const len = Math.hypot(nx, ny);
      const normX = nx / len;
      const normY = ny / len;

      const refl = reflectVector(ray.dx, ray.dy, normX, normY);

      ray.x = closestHit.x + refl.dx * 0.1;
      ray.y = closestHit.y + refl.dy * 0.1;
      ray.dx = refl.dx;
      ray.dy = refl.dy;

    } else if (hitType === 'tank') {
      if (insideTank === closestTank) {
        // Exiting the tank
        let currentAngle = Math.atan2(ray.dy, ray.dx);
        
        if (closestHit.side === 'top' || closestHit.side === 'bottom') {
          currentAngle -= closestTank.refractionOffset;
        } else if (closestHit.side === 'left' || closestHit.side === 'right') {
          currentAngle -= closestTank.refractionOffset;
        }
        
        ray.dx = Math.cos(currentAngle);
        ray.dy = Math.sin(currentAngle);
        
        ray.x = closestHit.x + ray.dx * 0.1;
        ray.y = closestHit.y + ray.dy * 0.1;
        
        insideTank = null;
      } else {
        // Entering the tank
        let currentAngle = Math.atan2(ray.dy, ray.dx);
        
        if (closestHit.side === 'top' || closestHit.side === 'bottom') {
          currentAngle += closestTank.refractionOffset;
        } else if (closestHit.side === 'left' || closestHit.side === 'right') {
          currentAngle += closestTank.refractionOffset;
        }
        
        ray.dx = Math.cos(currentAngle);
        ray.dy = Math.sin(currentAngle);
        
        ray.x = closestHit.x + ray.dx * 0.1;
        ray.y = closestHit.y + ray.dy * 0.1;
        
        insideTank = closestTank;
      }

    } else if (hitType === 'splitter') {
      const splitRays = closestSplitter.splitRay({
        x: closestHit.x,
        y: closestHit.y,
        dx: ray.dx,
        dy: ray.dy
      });
      
      // Offset each ray slightly and cast them recursively
      splitRays.forEach(r => {
        r.x += r.dx * 0.1;
        r.y += r.dy * 0.1;
        castRay(r); // Recursively cast each split ray
      });
      
      break; // Stop the original ray after splitting

    } else if (hitType === 'target') {
      // Mark this target as hit
      closestTarget.hit = true;
      
      // Check if ALL targets are now hit
      const allTargetsHit = targets.every(t => t.hit);
      
      if (allTargetsHit) {
        completeLevel();
      }
      
      break; // Stop the ray after hitting target
    }

    maxDistance -= closestHit.dist;
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



async function completeLevel() {
    if (levelTransitioning) return;
    levelTransitioning = true;

    setTimeout(async () => {

        // Move to next REAL gameplay level
        currentLevelIndex++;

        if (currentLevelIndex >= levelOrder.length) {
            alert("You finished all levels!");
            levelTransitioning = false;
            return;
        }

        alert("Level complete!");
        await loadLevel(levelOrder[currentLevelIndex]);
        levelTransitioning = false;

    }, 400); 
}





//Load level

async function loadLevel(path) {
  const data = await fetch(path).then(r => r.json());
  currentLevelData = data;
  // load background 
  bgLoaded = false;
  bg = new Image();
  bg.src = data.background;
  bg.onload = () => bgLoaded = true;
  bgm.play();
 

  //Dr Light
   // Load Dr Light image (if present)
  if (data.drLight) {
      drLight = {
          x: data.drLight.x,
          y: data.drLight.y,
          scale: data.drLight.scale
      };

      drLightImg = new Image();
      drLightLoaded = false;

      drLightImg.onload = () => drLightLoaded = true;
      drLightImg.src = data.drLight.img;

  } else {
      drLight = null;
      drLightImg = null;
  }

  // rebuild game objects 
  lightSource = new LightSource(
    data.lightSource.x,
    data.lightSource.y,
    data.lightSource.dx,
    data.lightSource.dy
  );

  mirrors = data.mirrors.map(m => new Mirror(m.x, m.y, m.angle));
  targets = data.targets.map(t => new Target(t.x, t.y));
  watertanks = data.watertanks.map(w => new WaterTank(w.x, w.y, w.width, w.height, w.refractionOffset));
  obstacles = data.obstacles.map(o => new Obstacle(o.x, o.y, o.width, o.height));
  raysplitters = data.raysplitters.map(o => new RaySplitter(o.x, o.y, o.width, o.height, o.splitAngle));
  console.log(raysplitters);

  // IMPORTANT: reset target hits only once per level, not each frame
  targets.forEach(t => t.hit = false);

   // If this level has a timed duration → auto transition
  if (data.duration) {
      setTimeout(() => {
          loadLevel("levels/level1.json");
      }, data.duration);
  }

  if(data.instructions){
    // Create instruction textbox
    const boxWidth = 400;
    const boxHeight = 150;
    const boxX = (canvas.width - boxWidth) / 2;
    const boxY = 50;
    const padding = 20;
    
    // Store instructions for rendering
    instructionBox = {
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      text: data.instructions,
      padding: padding
    };
  } else {
    instructionBox = null;
  }

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
  raysplitters.forEach( w => {
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

canvas.addEventListener("click", () => {
    if (bg && bg.src.includes("titleScreen")) {
        loadLevel("levels/level0.json");  // Dr Light intro
    }
});

// Function responisble for rotation 

window.addEventListener("keydown", e => {
    if (!draggingObj) return;

    if (e.key === "a" || e.key === "A") draggingObj.angle -= 0.1;
    if (e.key === "d" || e.key === "D") draggingObj.angle += 0.1;
});




function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);


  targets.forEach(t => t.hit = false);


  // Draw background
  if (bgLoaded) {
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
} else {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

  if (drLight && drLightLoaded) {
    const w = drLightImg.width * drLight.scale;
    const h = drLightImg.height * drLight.scale;
    
    ctx.drawImage(drLightImg, drLight.x, drLight.y, w, h);
  }
  

  lightSource.draw();

  mirrors.forEach(m => m.draw());
  watertanks.forEach(w => w.draw());
  targets.forEach(t => t.draw());
  obstacles.forEach(o => o.draw());
  raysplitters.forEach( r => r.draw());
  drawInstructionBox();

  
  
  castRay(lightSource);



  requestAnimationFrame(loop);
}

async function startGame() {
    bgm = new Audio("assets/music/lightemup.mp3");
    bgm.loop = true;
    bgm.volume = 0.5;

    await loadLevel("levels/title.json");
    loop();
}

startGame();