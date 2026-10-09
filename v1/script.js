
    // DOM Elements
    const startScreen   = document.getElementById('startScreen');
    const startButton   = document.getElementById('startButton');
    const gameContainer = document.getElementById('gameContainer');
    const canvas        = document.getElementById('gameCanvas');
    const ctx           = canvas.getContext('2d');
    const restartBtn    = document.getElementById('restartButton');
    const devCredit     = document.getElementById('developerCredit');
    const cssCar        = document.getElementById('cssCar');
    const leftBtn       = document.getElementById('leftBtn');
    const rightBtn      = document.getElementById('rightBtn');
    const scoreDisplay  = document.getElementById('scoreDisplay');
    const highScoreDisplay = document.getElementById('highScoreDisplay');
    const boostBar      = document.getElementById('boostBar');
    const countdown     = document.getElementById('countdown');
    const pauseScreen   = document.getElementById('pauseScreen');
    const resumeButton  = document.getElementById('resumeButton');
    const highScoreEl   = document.getElementById('highScore');

    // Audio elements
    const music         = document.getElementById('bgMusic');
    const coinSound     = document.getElementById('coinSound');
    const boostSound    = document.getElementById('boostSound');
    const crashSound    = document.getElementById('crashSound');

    // Game variables
    let lastTime = 0;
    let gameOver = false;
    let gamePaused = false;
    let score = 0;
    let highScore = localStorage.getItem('highScore') || 0;
    let laneOffset = 0;
    let boostActive = false;
    let boostTime = 0;
    const keys = { ArrowLeft: false, ArrowRight: false, KeyP: false };

    // Set high score display
    highScoreDisplay.textContent = highScore;

    // Car object
    const car = {
      x: 180, 
      y: 500, 
      w: 40, 
      h: 60,
      baseSpeed: 5, 
      wheelAngle: 0,
      touchX: null
    };

    // Game objects
    let obstacles = [], boosts = [], coins = [], particles = [];

    // Event listeners for keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') keys[e.key] = true;
      if (e.key === 'p' || e.key === 'P') keys['KeyP'] = true;
    });
    document.addEventListener('keyup', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') keys[e.key] = false;
      if (e.key === 'p' || e.key === 'P') keys['KeyP'] = false;
    });

    // Add steer control for buttons
    function addSteerControl(btn, keyName) {
      btn.addEventListener('mousedown', () => keys[keyName] = true);
      btn.addEventListener('mouseup',   () => keys[keyName] = false);
      btn.addEventListener('mouseleave',() => keys[keyName] = false);
      btn.addEventListener('touchstart', e => { e.preventDefault(); keys[keyName] = true; });
      btn.addEventListener('touchend',   e => { e.preventDefault(); keys[keyName] = false; });
    }
    addSteerControl(leftBtn, 'ArrowLeft');
    addSteerControl(rightBtn,'ArrowRight');

    // Touch controls
    canvas.addEventListener('touchstart', onTouch);
    canvas.addEventListener('touchmove',  onTouch);
    canvas.addEventListener('touchend',   () => car.touchX = null);
    function onTouch(e) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      car.touchX = e.touches[0].clientX - rect.left;
    }

    // Restart and resume buttons
    restartBtn.addEventListener('click', resetGame);
    resumeButton.addEventListener('click', togglePause);

    // Toggle pause function
    function togglePause() {
      gamePaused = !gamePaused;
      pauseScreen.style.display = gamePaused ? 'flex' : 'none';
      
      if (!gamePaused && !gameOver) {
        music.play().catch(() => {});
        requestAnimationFrame(loop);
      } else {
        music.pause();
      }
    }

    // Spawn game objects
    function spawnObstacle() {
      const spawnChance = 0.02 + (score * 0.0001);
      if (Math.random() < spawnChance) {
        const w = 30 + Math.random()*30;
        obstacles.push({
          x: Math.random()*(canvas.width - w),
          y: -60,
          w,
          h: 20 + Math.random()*20,
          speed: 3 + Math.random()*2 + (score * 0.01)
        });
      }
    }
    
    function spawnBoost() {
      if (Math.random() < 0.008) {
        boosts.push({
          x: Math.random()*(canvas.width - 80),
          y: -40,
          w: 80,
          h: 20,
          speed: 4
        });
      }
    }
    
    function spawnCoin() {
      if (Math.random() < 0.01) {
        coins.push({
          x: 20 + Math.random()*(canvas.width - 40),
          y: -20,
          r: 10,
          speed: 4,
          rotation: 0
        });
      }
    }

    // Collision detection
    function rectsCollide(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x &&
             a.y < b.y + b.h && a.y + a.h > b.y;
    }
    
    function circRectCollide(c, r) {
      const dx = Math.abs(c.x - (r.x + r.w/2));
      const dy = Math.abs(c.y - (r.y + r.h/2));
      if (dx > r.w/2 + c.r || dy > r.h/2 + c.r) return false;
      if (dx <= r.w/2 || dy <= r.h/2) return true;
      const dx2 = dx - r.w/2, dy2 = dy - r.h/2;
      return dx2*dx2 + dy2*dy2 <= c.r*c.r;
    }

    // Update game state
    function update(dt) {
      // Handle pause
      if (keys['KeyP']) {
        keys['KeyP'] = false;
        togglePause();
      }
      
      if (gamePaused) return;
      
      const factor = dt/16;
      
      // Car movement
      if (keys.ArrowLeft && car.x > 0) car.x -= car.baseSpeed * factor;
      if (keys.ArrowRight && car.x + car.w < canvas.width) car.x += car.baseSpeed * factor;

      if (car.touchX !== null) {
        const target = car.touchX - car.w/2;
        const diff = target - car.x;
        const maxMove = car.baseSpeed * factor;
        car.x += Math.abs(diff) > maxMove ? Math.sign(diff)*maxMove : diff;
      }

      // Update CSS car position
      cssCar.style.left = `${car.x}px`;
      
      // Road movement effect
      laneOffset += 4 * factor;
      if (laneOffset > 40) laneOffset = 0;
      
      // Spawn objects
      spawnObstacle(); 
      spawnBoost(); 
      spawnCoin();
      
      // Update obstacles
      obstacles.forEach((o,i) => {
        o.y += o.speed * factor;
        if (rectsCollide(car, o)) {
          gameOver = true;
          crashSound.play();
          music.pause();
          music.currentTime = 0;
        }
        if (o.y > canvas.height) { 
          obstacles.splice(i,1); 
          score++; 
          scoreDisplay.textContent = score;
        }
      });
      
      // Update boosts
      boosts.forEach((b,i) => {
        b.y += b.speed * factor;
        if (rectsCollide(car, b)) {
          boostActive = true;
          boostTime = 1500;
          boostSound.play();
          car.baseSpeed = 8;
          boosts.splice(i,1);
        }
        if (b.y > canvas.height) boosts.splice(i,1);
      });
      
      // Handle boost timer
      if (boostActive) {
        boostTime -= dt;
        boostBar.style.width = `${(boostTime / 1500) * 100}%`;
        
        if (boostTime <= 0) {
          boostActive = false;
          car.baseSpeed = 5;
          boostBar.style.width = '0%';
        }
      }
      
      // Update coins
      coins.forEach((c,i) => {
        c.y += c.speed * factor;
        c.rotation += 0.1 * factor;
        if (circRectCollide(c, car)) {
          score += 2;
          scoreDisplay.textContent = score;
          coinSound.play();
          coins.splice(i,1);
        }
        if (c.y > canvas.height) coins.splice(i,1);
      });
      
      // Add particles for car exhaust
      [8, car.w - 8].forEach(offset => {
        if (Math.random() < 0.5) {
          particles.push({ 
            x: car.x + offset, 
            y: car.y + car.h, 
            r: 2 + Math.random()*2, 
            life: 20,
            color: boostActive ? '#00ffcc' : '#aaaaaa'
          });
        }
      });
      
      // Update particles
      particles.forEach((p,i) => {
        p.y += 2 * factor;
        p.x += (Math.random() - 0.5) * 2;
        if (--p.life <= 0) particles.splice(i,1);
      });
    }

    // Draw game objects
    function draw() {
      // Clear canvas
      ctx.clearRect(0,0,canvas.width,canvas.height);
      
      // Draw background
      const grad = ctx.createLinearGradient(0,0,0,canvas.height);
      grad.addColorStop(0,'#223355');
      grad.addColorStop(1,'#111122');
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,canvas.width,canvas.height);
      
      // Draw road
      ctx.fillStyle = '#333344';
      ctx.fillRect(50,0,canvas.width-100,canvas.height);
      
      // Draw road markings
      ctx.fillStyle = '#aaaaaa';
      for (let y = -20 + laneOffset; y < canvas.height; y += 40) {
        ctx.fillRect(canvas.width/2 - 2, y, 4, 20);
      }
      
      // Draw boosts
      boosts.forEach(b => {
        const gradient = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
        gradient.addColorStop(0, '#00ff00');
        gradient.addColorStop(1, '#009900');
        ctx.fillStyle = gradient;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        
        // Draw boost icon
        ctx.fillStyle = 'black';
        ctx.font = '16px Arial';
        ctx.fillText('⚡', b.x + b.w/2 - 8, b.y + b.h/2 + 6);
      });
      
      // Draw coins
      coins.forEach(c => {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rotation);
        ctx.fillStyle = 'gold';
        ctx.beginPath();
        ctx.arc(0, 0, c.r, 0, Math.PI*2);
        ctx.fill();
        
        ctx.fillStyle = '#daa520';
        ctx.beginPath();
        ctx.arc(0, 0, c.r * 0.7, 0, Math.PI*2);
        ctx.fill();
        
        ctx.fillStyle = 'black';
        ctx.font = 'bold 10px Arial';
        ctx.fillText('$', -3, 4);
        ctx.restore();
      });
      
      // Draw obstacles
      obstacles.forEach(o => {
        const gradient = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
        gradient.addColorStop(0, '#ff5555');
        gradient.addColorStop(1, '#cc0000');
        ctx.fillStyle = gradient;
        ctx.fillRect(o.x, o.y, o.w, o.h);
      });
      
      // Draw particles
      particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();
      });
      
      // Draw car shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(car.x + 5, car.y + car.h + 2, car.w - 10, 10);
      
      // Game over screen
      if (gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = '#FF5555';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width/2, 250);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '30px sans-serif';
        ctx.fillText(`Score: ${score}`, canvas.width/2, 300);
        
        if (score > highScore) {
          ctx.fillStyle = 'gold';
          ctx.font = 'bold 26px sans-serif';
          ctx.fillText('NEW HIGH SCORE!', canvas.width/2, 350);
        }
        
        restartBtn.style.display = 'block';
        devCredit.style.bottom = '10px';
      }
    }

    // Game loop
    function loop(ts=0) {
      const dt = ts - lastTime || 16;
      lastTime = ts;
      
      if (!gameOver && !gamePaused) update(dt);
      draw();
      
      if (!gameOver && !gamePaused) {
        requestAnimationFrame(loop);
      }
    }

    // Start countdown
    function startCountdown() {
      let count = 3;
      countdown.style.display = 'flex';
      countdown.textContent = count;
      
      const countdownInterval = setInterval(() => {
        count--;
        countdown.textContent = count;
        
        if (count <= 0) {
          clearInterval(countdownInterval);
          countdown.style.display = 'none';
          requestAnimationFrame(loop);
        }
      }, 1000);
    }

    // Reset game
    function resetGame() {
      gameOver = false;
      gamePaused = false;
      score = 0;
      scoreDisplay.textContent = score;
      obstacles = [];
      boosts = [];
      coins = [];
      particles = [];
      car.x = 180;
      car.baseSpeed = 5;
      boostActive = false;
      boostTime = 0;
      boostBar.style.width = '0%';
      lastTime = 0;
      restartBtn.style.display = 'none';
      devCredit.style.bottom = '-50px';
      pauseScreen.style.display = 'none';
      
      // Update high score if needed
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', highScore);
        highScoreDisplay.textContent = highScore;
      }
      
      // Start countdown and game
      music.currentTime = 0;
      music.play().catch(() => {});
      startCountdown();
    }

    // Start game
    startButton.addEventListener('click', () => {
      music.volume = 0.3;
      startScreen.style.display = 'none';
      gameContainer.style.display = 'block';
      resetGame();
    });
