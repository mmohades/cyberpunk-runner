class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d', {
            alpha: false,
            desynchronized: true,
            willReadFrequently: false
        });

        // Initialize game parameters first
        this.minPlatformWidth = 100;
        this.maxPlatformWidth = 300;
        this.minPlatformHeight = 30;
        this.maxPlatformHeight = 40;
        this.minPlatformGap = 150;
        this.maxPlatformGap = 400;
        this.minPlatformHeightDiff = 80;
        this.maxPlatformHeightDiff = 200;
        this.gravity = 0.45;
        this.jumpForce = -15;
        this.maxJumps = 2;

        // Performance optimization
        this.lastFrameTime = 0;
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;
        this.accumulator = 0;
        this.isAnimating = false;
        this.lastPlatformCheck = 0;
        this.platformCheckInterval = 100; // Check platforms every 100ms
        this.visiblePlatforms = new Set();
        this.visibleLavaPits = new Set();

        // Set initial canvas size
        this.setCanvasSize();

        // Add resize event listener with debounce
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.setCanvasSize(), 100);
        });

        // Enhanced touch controls
        let touchStartY = 0;
        let touchStartTime = 0;

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();

            if (this.gameStarted && !this.gameOver) {
                this.jump();
            } else if (!this.gameStarted) {
                this.startGame();
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const touchEndY = e.changedTouches[0].clientY;
            const touchEndTime = Date.now();
            const swipeDistance = touchStartY - touchEndY;
            const swipeTime = touchEndTime - touchStartTime;

            // Detect swipe up for double jump
            if (swipeDistance > 50 && swipeTime < 300) {
                if (this.gameStarted && !this.gameOver && this.player.jumpsRemaining > 0) {
                    this.jump();
                }
            }
        }, { passive: false });

        // Prevent default touch behavior
        document.addEventListener('touchmove', (e) => {
            if (e.target === this.canvas) {
                e.preventDefault();
            }
        }, { passive: false });

        // Game state
        this.gameOver = false;
        this.gameStarted = false;
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('highScore')) || 0;
        this.baseScrollSpeed = 7;
        this.scrollSpeed = this.baseScrollSpeed;
        this.speedBoostMultiplier = 2.0;
        this.cheatCodeEnabled = false;
        this.cheatCodeBuffer = '';
        this.cheatCodeTimeout = null;

        // Asset loading
        this.assets = {
            player: new Image(),
            platform: new Image(),
            platformGlow: new Image(),
            lava: new Image(),
            background: new Image()
        };

        // Load assets
        this.assets.player.src = 'assets/player.png';
        this.assets.platform.src = 'assets/platform.png';
        this.assets.platformGlow.src = 'assets/platform-glow.png';
        this.assets.lava.src = 'assets/lava.png';
        this.assets.background.src = 'assets/background.png';

        // Initialize player after assets are loaded
        this.assets.player.onload = () => {
            // Calculate sprite dimensions
            const spriteWidth = this.assets.player.width / 4; // Assuming 4 frames
            const spriteHeight = this.assets.player.height;

            // Player properties
            this.player = {
                x: this.canvas.width * 0.1,
                y: this.groundY - 40,
                width: Math.min(40, this.canvas.width * 0.08),
                height: Math.min(40, this.canvas.width * 0.08),
                velocityY: 0,
                isJumping: false,
                onPlatform: false,
                jumpsRemaining: this.maxJumps,
                frame: 0,
                frameCount: 4,
                frameDelay: 5,
                frameTimer: 0,
                hasSpeedBoost: false,
                boostEndTime: 0,
                boostTrail: [],
                isInvulnerable: false,
                invulnerabilityEndTime: 0,
                spriteWidth: spriteWidth,
                spriteHeight: spriteHeight
            };
        };

        // Platforms array
        this.platforms = [];
        this.platformTimer = 0;
        this.basePlatformInterval = 2000; // Base interval for platform generation

        // Lava pits array
        this.lavaPits = [];
        this.lavaTimer = 0;
        this.baseLavaInterval = 2000; // Base interval for lava generation

        // Platform types
        this.platformTypes = {
            NORMAL: {
                color: '#8B4513',
                probability: 0.8, // 80% chance
                effect: null
            },
            SPEED_BOOST: {
                color: '#00ff9d', // Cyberpunk green
                probability: 0.2, // 20% chance
                effect: (player) => {
                    if (!this.player.hasSpeedBoost) {
                        this.player.hasSpeedBoost = true;
                        this.player.boostEndTime = Date.now() + 2500; // 2.5 seconds from now
                        this.player.boostTrail = []; // Reset trail when boost starts
                    }
                }
            }
            // Easy to add new platform types here
        };

        // Audio setup
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);
        this.masterGain.gain.value = 0.3;

        // Create audio nodes
        this.jumpGain = this.audioContext.createGain();
        this.jumpGain.gain.value = 0.3;
        this.jumpGain.connect(this.masterGain);

        this.bgmGain = this.audioContext.createGain();
        this.bgmGain.gain.value = 0.5;
        this.bgmGain.connect(this.masterGain);

        // Load background music
        const audioPath = './assets/audio/ball_game_bg.mp3';
        console.log('Loading audio from:', audioPath);
        this.backgroundMusic = new Audio(audioPath);
        this.backgroundMusic.loop = true;

        // Add error handling for audio loading
        this.backgroundMusic.addEventListener('error', (e) => {
            console.error('Error loading audio:', e);
            console.log('Audio error code:', this.backgroundMusic.error.code);
            console.log('Audio error message:', this.backgroundMusic.error.message);
        });

        this.backgroundMusic.addEventListener('canplaythrough', () => {
            console.log('Audio loaded successfully');
        });

        // Start button event listener
        document.getElementById('startButton').addEventListener('click', () => {
            this.startGame();
        });

        // Event listeners
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault(); // Prevent space from scrolling the page
                this.jump();
            }
            if (e.code === 'KeyR' && this.gameOver) {
                this.restart();
            }
        });

        document.getElementById('restartButton').addEventListener('click', () => {
            this.restart();
        });

        // Add cheat code event listener
        document.addEventListener('keydown', (e) => {
            if (!this.gameStarted) {
                this.cheatCodeBuffer += e.key.toLowerCase();
                if (this.cheatCodeBuffer.length > 7) {
                    this.cheatCodeBuffer = this.cheatCodeBuffer.slice(-7);
                }

                if (this.cheatCodeBuffer === 'hesoyam') {
                    this.cheatCodeEnabled = true;
                    this.showCheatCodeMessage();
                }

                // Clear buffer after 2 seconds of inactivity
                clearTimeout(this.cheatCodeTimeout);
                this.cheatCodeTimeout = setTimeout(() => {
                    this.cheatCodeBuffer = '';
                }, 2000);
            }
        });

        // Start game loop
        this.animate(0);
    }

    playJumpSound() {
        // Create a simple jump sound using Web Audio API
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(440, this.audioContext.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);

        oscillator.connect(gainNode);
        gainNode.connect(this.jumpGain);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.1);
    }

    startBackgroundMusic() {
        // Ensure audio context is running
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Reset the audio to start and play
        this.backgroundMusic.currentTime = 0;
        const playPromise = this.backgroundMusic.play();

        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log('Background music started playing');
            }).catch(error => {
                console.error('Error playing background music:', error);
                // Try to play again after user interaction
                document.addEventListener('click', () => {
                    this.backgroundMusic.play().catch(e => console.error('Still failed to play:', e));
                }, { once: true });
            });
        }
    }

    showCheatCodeMessage() {
        const message = document.createElement('div');
        message.id = 'cheatCodeMessage';
        message.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(0, 255, 157, 0.2);
            color: #00ff9d;
            padding: 10px 20px;
            border: 2px solid #00ff9d;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 16px;
            z-index: 1000;
            text-shadow: 0 0 5px #00ff9d;
        `;
        message.textContent = 'CHEAT CODE ENABLED: INFINITE JUMPS';
        document.body.appendChild(message);

        // Remove message after 3 seconds
        setTimeout(() => {
            message.remove();
        }, 3000);
    }

    jump() {
        if (!this.gameStarted || this.gameOver) return;

        if (this.player.jumpsRemaining > 0) {
            this.player.velocityY = this.jumpForce;
            this.player.isJumping = true;
            this.player.jumpsRemaining--;
            this.playJumpSound();

            // Add haptic feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }
    }

    createPlatform(x, y, width, height) {
        // Determine platform type based on probabilities
        const rand = Math.random();
        let cumulativeProbability = 0;
        let selectedType = this.platformTypes.NORMAL;

        for (const type of Object.values(this.platformTypes)) {
            cumulativeProbability += type.probability;
            if (rand <= cumulativeProbability) {
                selectedType = type;
                break;
            }
        }

        return {
            x: x,
            y: y,
            width: width,
            height: height,
            type: selectedType,
            color: selectedType.color
        };
    }

    createPlatformScenario() {
        const scenario = Math.floor(Math.random() * 5);
        const baseX = this.canvas.width;
        // Ensure minimum Y is never below ground level
        const minY = Math.max(this.player.y - 100, this.groundY - this.maxPlatformHeightDiff);
        const maxY = this.groundY - this.minPlatformHeight;
        const baseY = Math.min(maxY, Math.max(minY, this.groundY - this.minPlatformHeight));

        switch (scenario) {
            case 0: // Staircase up
                this.createStaircase(baseX, baseY, true);
                break;
            case 1: // Staircase down
                this.createStaircase(baseX, baseY, false);
                break;
            case 2: // Double platform
                this.createDoublePlatform(baseX, baseY);
                break;
            case 3: // Floating platforms
                this.createFloatingPlatforms(baseX, baseY);
                break;
            case 4: // Pyramid
                this.createPyramid(baseX, baseY);
                break;
        }
    }

    createStaircase(startX, baseY, goingUp) {
        const steps = 3;
        const stepWidth = 80;
        const stepHeight = 30;
        const heightDiff = goingUp ? -stepHeight : stepHeight;
        // Ensure minimum Y is never below ground level
        const minY = Math.max(this.player.y - 100, this.groundY - this.maxPlatformHeightDiff);

        for (let i = 0; i < steps; i++) {
            const y = Math.max(minY, Math.min(baseY + (i * heightDiff), this.groundY - this.minPlatformHeight));
            this.platforms.push(this.createPlatform(
                startX + (i * (stepWidth + 50)),
                y,
                stepWidth,
                this.minPlatformHeight
            ));
        }
    }

    createDoublePlatform(startX, baseY) {
        // Ensure minimum Y is never below ground level
        const minY = Math.max(this.player.y - 100, this.groundY - this.maxPlatformHeightDiff);
        const height1 = Math.max(minY, Math.min(baseY - this.minPlatformHeight, this.groundY - this.minPlatformHeight));
        const height2 = Math.max(minY, Math.min(height1 - this.minPlatformHeightDiff, this.groundY - this.minPlatformHeight));

        this.platforms.push(this.createPlatform(
            startX,
            height1,
            this.minPlatformWidth + Math.random() * 50,
            this.minPlatformHeight
        ));

        this.platforms.push(this.createPlatform(
            startX + 150,
            height2,
            this.minPlatformWidth + Math.random() * 50,
            this.minPlatformHeight
        ));
    }

    createFloatingPlatforms(startX, baseY) {
        const numPlatforms = 3;
        const spacing = 120;
        // Ensure minimum Y is never below ground level
        const minY = Math.max(this.player.y - 100, this.groundY - this.maxPlatformHeightDiff);

        for (let i = 0; i < numPlatforms; i++) {
            const height = Math.max(minY, Math.min(baseY - (Math.random() * this.maxPlatformHeightDiff), this.groundY - this.minPlatformHeight));
            this.platforms.push(this.createPlatform(
                startX + (i * spacing),
                height,
                this.minPlatformWidth + Math.random() * 50,
                this.minPlatformHeight
            ));
        }
    }

    createPyramid(startX, baseY) {
        const baseWidth = 200;
        const height = 3;
        const widthDecrease = 40;
        // Ensure minimum Y is never below ground level
        const minY = Math.max(this.player.y - 100, this.groundY - this.maxPlatformHeightDiff);

        for (let i = 0; i < height; i++) {
            const y = Math.max(minY, Math.min(baseY - (i * this.minPlatformHeightDiff), this.groundY - this.minPlatformHeight));
            this.platforms.push(this.createPlatform(
                startX + (i * widthDecrease / 2),
                y,
                baseWidth - (i * widthDecrease),
                this.minPlatformHeight
            ));
        }
    }

    createLavaPit() {
        const width = Math.min(100 + Math.random() * 150, this.canvas.width * 0.3);
        const height = Math.min(30 + Math.random() * 30, this.canvas.height * 0.05);
        this.lavaPits.push({
            x: this.canvas.width,
            width: width,
            height: height,
            color: '#FF4500'
        });
    }

    checkPlatformCollision(player, platform) {
        const playerBottom = player.y + player.height;
        const playerCenterX = player.x + player.width / 2;

        if (player.velocityY >= 0 &&
            playerBottom >= platform.y &&
            playerBottom <= platform.y + platform.height &&
            playerCenterX > platform.x &&
            playerCenterX < platform.x + platform.width) {

            // Apply platform effect if it exists
            if (platform.type.effect) {
                platform.type.effect(player);
            }

            return true;
        }
        return false;
    }

    checkLavaCollision(player, lavaPit) {
        if (player.isInvulnerable) return false;

        const playerBottom = player.y + player.height;
        const playerCenterX = player.x + player.width / 2;

        return playerBottom >= this.groundY &&
            playerCenterX > lavaPit.x &&
            playerCenterX < lavaPit.x + lavaPit.width;
    }

    update(deltaTime) {
        if (this.gameOver || !this.gameStarted) return;

        // Update base speed for difficulty - even faster progression
        this.baseScrollSpeed = 7 + Math.floor(this.score / 600); // Much faster speed increase

        // Handle speed boost state
        if (this.player.hasSpeedBoost && Date.now() >= this.player.boostEndTime) {
            this.player.hasSpeedBoost = false;
            this.player.boostTrail = [];
        }

        // Set final scroll speed
        this.scrollSpeed = this.baseScrollSpeed * (this.player.hasSpeedBoost ? this.speedBoostMultiplier : 1);

        // Update score
        this.score += deltaTime * 0.1;

        // Update high score if needed
        if (this.score > this.highScore) {
            this.highScore = Math.floor(this.score);
            localStorage.setItem('highScore', this.highScore.toString());
        }

        // Update player animation only when needed
        if (this.player.isJumping || this.player.velocityY !== 0) {
            this.player.frameTimer++;
            if (this.player.frameTimer >= this.player.frameDelay) {
                this.player.frame = (this.player.frame + 1) % this.player.frameCount;
                this.player.frameTimer = 0;
            }
        }

        // Apply physics to player
        this.player.velocityY += this.gravity;
        this.player.y += this.player.velocityY;

        // Ground collision
        if (this.player.y + this.player.height > this.groundY) {
            this.player.y = this.groundY - this.player.height;
            this.player.velocityY = 0;
            this.player.isJumping = false;
            this.player.onPlatform = true;
            this.player.jumpsRemaining = this.maxJumps;
        } else {
            this.player.onPlatform = false;
        }

        // Optimize platform collision checks
        const now = Date.now();
        if (now - this.lastPlatformCheck >= this.platformCheckInterval) {
            this.lastPlatformCheck = now;
            this.visiblePlatforms.clear();
            this.visibleLavaPits.clear();

            // Only check platforms that are visible on screen
            for (const platform of this.platforms) {
                if (platform.x + platform.width > 0 && platform.x < this.canvas.width) {
                    this.visiblePlatforms.add(platform);
                    if (this.checkPlatformCollision(this.player, platform)) {
                        this.player.y = platform.y - this.player.height;
                        this.player.velocityY = 0;
                        this.player.isJumping = false;
                        this.player.onPlatform = true;
                        this.player.jumpsRemaining = this.maxJumps;
                        break;
                    }
                }
            }

            // Only check lava pits that are visible on screen
            for (const lavaPit of this.lavaPits) {
                if (lavaPit.x + lavaPit.width > 0 && lavaPit.x < this.canvas.width) {
                    this.visibleLavaPits.add(lavaPit);
                    if (this.checkLavaCollision(this.player, lavaPit)) {
                        this.endGame();
                        return;
                    }
                }
            }
        }

        // Calculate speed-based intervals
        const speedFactor = Math.max(1, this.scrollSpeed / 3);
        const platformInterval = this.basePlatformInterval / speedFactor;
        const lavaInterval = this.baseLavaInterval / speedFactor;

        // Update platforms
        this.platformTimer += deltaTime;
        if (this.platformTimer > platformInterval) {
            this.createPlatformScenario();
            this.platformTimer = 0;
        }

        // Move platforms
        for (let i = this.platforms.length - 1; i >= 0; i--) {
            const platform = this.platforms[i];
            platform.x -= this.scrollSpeed;

            if (platform.x + platform.width < 0) {
                this.platforms.splice(i, 1);
            }
        }

        // Update lava pits
        this.lavaTimer += deltaTime;
        if (this.lavaTimer > lavaInterval) {
            if (Math.random() < 0.3) {
                this.createLavaPit();
                setTimeout(() => this.createLavaPit(), 800 / speedFactor);
            } else {
                this.createLavaPit();
            }
            this.lavaTimer = 0;
        }

        // Move lava pits
        for (let i = this.lavaPits.length - 1; i >= 0; i--) {
            const lavaPit = this.lavaPits[i];
            lavaPit.x -= this.scrollSpeed;

            if (lavaPit.x + lavaPit.width < 0) {
                this.lavaPits.splice(i, 1);
            }
        }
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background with proper scaling
        this.ctx.drawImage(this.assets.background, 0, 0, this.canvas.width, this.canvas.height);

        if (!this.gameStarted) return;

        // Draw ground with enhanced visibility
        this.ctx.fillStyle = '#2a2a4a';
        this.ctx.fillRect(0, this.groundY, this.canvas.width, this.canvas.height - this.groundY);

        // Add ground glow
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillStyle = '#00ff9d';
        this.ctx.fillRect(0, this.groundY - 2, this.canvas.width, 4);
        this.ctx.globalAlpha = 1.0;

        // Draw only visible platforms
        for (const platform of this.visiblePlatforms) {
            // Draw platform glow
            this.ctx.globalAlpha = 0.3;
            this.ctx.drawImage(this.assets.platformGlow,
                platform.x - 5, platform.y - 5,
                platform.width + 10, platform.height + 10);
            this.ctx.globalAlpha = 1.0;

            // Draw platform with type-specific color
            this.ctx.fillStyle = platform.color;
            this.ctx.fillRect(platform.x, platform.y, platform.width, platform.height);

            // Draw platform details
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(platform.x, platform.y, platform.width, platform.height);
        }

        // Draw only visible lava pits
        for (const lavaPit of this.visibleLavaPits) {
            // Draw lava glow (sides and bottom only)
            this.ctx.globalAlpha = 0.4;
            this.ctx.fillStyle = '#ff0000';
            // Left glow
            this.ctx.fillRect(lavaPit.x - 10, this.groundY,
                10, lavaPit.height + 20);
            // Right glow
            this.ctx.fillRect(lavaPit.x + lavaPit.width, this.groundY,
                10, lavaPit.height + 20);
            // Bottom glow
            this.ctx.fillRect(lavaPit.x - 10, this.groundY + lavaPit.height,
                lavaPit.width + 20, 20);
            this.ctx.globalAlpha = 1.0;

            // Draw lava with enhanced contrast
            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.drawImage(this.assets.lava,
                lavaPit.x, this.groundY,
                lavaPit.width, lavaPit.height);
            this.ctx.globalCompositeOperation = 'source-over';
        }

        // Draw speed boost trail only if active
        if (this.player.hasSpeedBoost && this.player.boostTrail.length > 0) {
            this.ctx.save();
            this.player.boostTrail.forEach(particle => {
                this.ctx.globalAlpha = particle.alpha;
                const gradient = this.ctx.createLinearGradient(
                    particle.x, particle.y,
                    particle.x - 30, particle.y
                );
                gradient.addColorStop(0, '#00ff9d');
                gradient.addColorStop(1, 'rgba(0, 255, 157, 0)');
                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.moveTo(particle.x, particle.y - 5 * particle.scale);
                this.ctx.lineTo(particle.x - 30, particle.y);
                this.ctx.lineTo(particle.x, particle.y + 5 * particle.scale);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.shadowColor = '#00ff9d';
                this.ctx.shadowBlur = 10;
                this.ctx.fill();
            });
            this.ctx.restore();
        }

        // Draw player with invulnerability effect
        if (this.player.isInvulnerable) {
            this.ctx.globalAlpha = 0.5;
        }

        // Draw player sprite with proper frame
        this.ctx.drawImage(
            this.assets.player,
            this.player.frame * this.player.spriteWidth, 0,
            this.player.spriteWidth, this.player.spriteHeight,
            this.player.x, this.player.y,
            this.player.width, this.player.height
        );
        this.ctx.globalAlpha = 1.0;

        // Draw cheat code indicator if enabled
        if (this.cheatCodeEnabled) {
            this.ctx.save();
            this.ctx.fillStyle = '#00ff9d';
            this.ctx.globalAlpha = 0.3;
            this.ctx.font = '16px "Courier New"';
            this.ctx.textAlign = 'right';
            this.ctx.fillText('INFINITE JUMPS', this.canvas.width - 10, 30);
            this.ctx.restore();
        }

        // Update score display
        document.getElementById('score').textContent = `Score: ${Math.floor(this.score)}`;
        document.getElementById('highScore').textContent = `High Score: ${this.highScore}`;
    }

    endGame() {
        if (this.player.isInvulnerable) return;

        this.player.isInvulnerable = true;
        this.player.invulnerabilityEndTime = Date.now() + 200;

        setTimeout(() => {
            if (this.player.isInvulnerable) {
                this.player.isInvulnerable = false;
                this.gameOver = true;
                this.isAnimating = false;
                document.getElementById('gameOver').style.display = 'block';

                const finalScore = Math.floor(this.score);
                document.getElementById('finalScore').textContent = `Final Score: ${finalScore}`;

                const highScoreMessage = document.getElementById('highScoreMessage');
                if (finalScore >= this.highScore) {
                    highScoreMessage.style.display = 'block';
                } else {
                    highScoreMessage.style.display = 'none';
                }
            }
        }, 200);
    }

    restart() {
        this.gameOver = false;
        this.gameStarted = true;
        this.score = 0;
        this.platforms = [];
        this.lavaPits = [];
        this.platformTimer = 0;
        this.lavaTimer = 0;
        this.baseScrollSpeed = 7;
        this.scrollSpeed = this.baseScrollSpeed;
        this.player.x = 100;
        this.player.y = this.groundY - this.player.height;
        this.player.velocityY = 0;
        this.player.isJumping = false;
        this.player.onPlatform = false;
        this.player.jumpsRemaining = this.maxJumps;
        this.player.hasSpeedBoost = false;
        this.player.boostEndTime = 0;
        this.player.boostTrail = [];
        this.player.isInvulnerable = false;
        this.player.invulnerabilityEndTime = 0;
        this.cheatCodeEnabled = false;
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('highScoreMessage').style.display = 'none';
        this.isAnimating = true;
        this.lastFrameTime = performance.now();
        this.animate(this.lastFrameTime);
    }

    startGame() {
        this.gameStarted = true;
        document.getElementById('startScreen').style.display = 'none';
        this.startBackgroundMusic();
        this.isAnimating = true;
        this.lastFrameTime = performance.now();
        this.animate(this.lastFrameTime);
    }

    animate(currentTime) {
        if (!this.isAnimating) return;

        // Calculate delta time
        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;

        // Accumulate time
        this.accumulator += deltaTime;

        // Update game state at fixed intervals
        while (this.accumulator >= this.frameInterval) {
            this.update(this.frameInterval);
            this.accumulator -= this.frameInterval;
        }

        // Draw the current state
        this.draw();

        // Request next frame
        requestAnimationFrame((time) => this.animate(time));
    }

    setCanvasSize() {
        // Get the container dimensions
        const container = document.getElementById('gameContainer');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        // Set canvas to fill the container
        this.canvas.width = containerWidth;
        this.canvas.height = containerHeight;

        // Calculate game parameters based on screen size
        const screenRatio = containerWidth / containerHeight;
        const baseSize = Math.min(containerWidth, containerHeight);

        // Calculate sizes first - adjusted for iPhone Pro Max
        const playerSize = Math.min(50, baseSize * 0.1); // Slightly larger player
        const minPlatformWidth = Math.min(120, baseSize * 0.25); // Wider platforms
        const maxPlatformWidth = Math.min(350, baseSize * 0.45);
        const minPlatformHeight = Math.min(35, baseSize * 0.06);
        const maxPlatformHeight = Math.min(45, baseSize * 0.08);
        const minPlatformGap = Math.min(180, baseSize * 0.3); // Larger gaps
        const maxPlatformGap = Math.min(450, baseSize * 0.55);
        const minPlatformHeightDiff = Math.min(90, baseSize * 0.17);
        const maxPlatformHeightDiff = Math.min(220, baseSize * 0.35);

        // Update ground position - adjusted for iPhone Pro Max
        this.groundY = this.canvas.height - (this.canvas.height * 0.12);

        // Only update player if it exists
        if (this.player) {
            this.player.width = playerSize;
            this.player.height = playerSize;
            this.player.x = this.canvas.width * 0.1;
            this.player.y = this.groundY - this.player.height;
        }

        // Update game parameters
        this.minPlatformWidth = minPlatformWidth;
        this.maxPlatformWidth = maxPlatformWidth;
        this.minPlatformHeight = minPlatformHeight;
        this.maxPlatformHeight = maxPlatformHeight;
        this.minPlatformGap = minPlatformGap;
        this.maxPlatformGap = maxPlatformGap;
        this.minPlatformHeightDiff = minPlatformHeightDiff;
        this.maxPlatformHeightDiff = maxPlatformHeightDiff;

        // Adjust physics for better mobile feel
        this.gravity = 0.45; // Even more gravity
        this.jumpForce = -15; // Even higher jumps
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); 