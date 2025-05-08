class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 1280;  // Increased from 800
        this.canvas.height = 720;  // Increased from 600, maintaining 16:9 ratio

        // Game state
        this.gameOver = false;
        this.gameStarted = false;
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('highScore')) || 0;
        this.baseScrollSpeed = 3;
        this.scrollSpeed = this.baseScrollSpeed;
        this.speedBoostMultiplier = 1.5;
        this.cheatCodeEnabled = false;
        this.cheatCodeBuffer = '';
        this.cheatCodeTimeout = null;

        // Physics constants
        this.gravity = 0.3;  // Reduced from 0.5 for floatier feel
        this.jumpForce = -10; // Reduced from -12 for more control
        this.maxJumps = 2;    // Allow double jump
        this.groundY = this.canvas.height - 80;

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

        // Player properties
        this.player = {
            x: 100,
            y: this.groundY - 40,
            width: 40,
            height: 40,
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
            boostTrail: [], // Array to store trail particles
            isInvulnerable: false,
            invulnerabilityEndTime: 0
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

        // Platform generation settings
        this.minPlatformWidth = 100;
        this.maxPlatformWidth = 300;
        this.minPlatformHeight = 30;
        this.maxPlatformHeight = 40;
        this.minPlatformGap = 150;
        this.maxPlatformGap = 400;
        this.minPlatformHeightDiff = 80;
        this.maxPlatformHeightDiff = 200;

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
        this.lastTime = 0;
        this.animate(0);
    }

    createJumpSound() {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime); // A5 note
        oscillator.frequency.exponentialRampToValueAtTime(440, this.audioContext.currentTime + 0.1); // A4 note

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
        if (this.cheatCodeEnabled || this.player.jumpsRemaining > 0) {
            this.player.velocityY = this.jumpForce;
            this.player.isJumping = true;
            this.player.onPlatform = false;
            if (!this.cheatCodeEnabled) {
                this.player.jumpsRemaining--;
            }

            // Play jump sound
            this.createJumpSound();
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
        const width = 100 + Math.random() * 150; // Reduced from 150-350 to 100-250
        const height = 30 + Math.random() * 30; // Reduced from 40-80 to 30-60
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

        // Update base speed for difficulty
        this.baseScrollSpeed = 3 + Math.floor(this.score / 1000);

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

        // Update player animation
        this.player.frameTimer++;
        if (this.player.frameTimer >= this.player.frameDelay) {
            this.player.frame = (this.player.frame + 1) % this.player.frameCount;
            this.player.frameTimer = 0;
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

        // Platform collision
        this.player.onPlatform = false;
        for (const platform of this.platforms) {
            if (this.checkPlatformCollision(this.player, platform)) {
                this.player.y = platform.y - this.player.height;
                this.player.velocityY = 0;
                this.player.isJumping = false;
                this.player.onPlatform = true;
                this.player.jumpsRemaining = this.maxJumps;
                break;
            }
        }

        // Calculate speed-based intervals
        const speedFactor = Math.max(1, this.scrollSpeed / 3); // Normalize to base speed
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
            // 30% chance to spawn two lava pits close together
            if (Math.random() < 0.3) {
                this.createLavaPit();
                setTimeout(() => this.createLavaPit(), 800 / speedFactor); // Scale the delay with speed
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

            if (this.checkLavaCollision(this.player, lavaPit)) {
                this.endGame();
            }
        }
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background
        this.ctx.drawImage(this.assets.background, 0, 0, this.canvas.width, this.canvas.height);

        if (!this.gameStarted) return;

        // Draw ground with enhanced visibility
        this.ctx.fillStyle = '#2a2a4a'; // Darker base color
        this.ctx.fillRect(0, this.groundY, this.canvas.width, this.canvas.height - this.groundY);

        // Add ground glow
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillStyle = '#00ff9d';
        this.ctx.fillRect(0, this.groundY - 2, this.canvas.width, 4);
        this.ctx.globalAlpha = 1.0;

        // Draw platforms
        this.platforms.forEach(platform => {
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
        });

        // Draw lava pits with enhanced contrast
        this.lavaPits.forEach(lavaPit => {
            // Draw lava glow (sides and bottom only)
            this.ctx.globalAlpha = 0.4; // Increased glow opacity
            this.ctx.fillStyle = '#ff0000'; // Brighter red for glow
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
            this.ctx.globalCompositeOperation = 'lighter'; // Add blending mode
            this.ctx.drawImage(this.assets.lava,
                lavaPit.x, this.groundY,
                lavaPit.width, lavaPit.height);
            this.ctx.globalCompositeOperation = 'source-over'; // Reset blending mode
        });

        // Draw speed boost trail
        if (this.player.hasSpeedBoost && this.player.boostTrail.length > 0) {
            this.ctx.save();
            this.player.boostTrail.forEach(particle => {
                this.ctx.globalAlpha = particle.alpha;

                // Draw trail particle
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

                // Add glow effect
                this.ctx.shadowColor = '#00ff9d';
                this.ctx.shadowBlur = 10;
                this.ctx.fill();
            });
            this.ctx.restore();
        }

        // Draw player with invulnerability effect
        if (this.player.isInvulnerable) {
            this.ctx.globalAlpha = 0.5; // Make player semi-transparent when invulnerable
        }
        this.ctx.drawImage(this.assets.player,
            this.player.frame * this.player.width, 0,
            this.player.width, this.player.height,
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
        this.player.invulnerabilityEndTime = Date.now() + 200; // 0.2 seconds

        // Check if player is still in lava after invulnerability
        setTimeout(() => {
            if (this.player.isInvulnerable) {
                this.player.isInvulnerable = false;
                this.gameOver = true;
                document.getElementById('gameOver').style.display = 'block';

                // Update final score display
                const finalScore = Math.floor(this.score);
                document.getElementById('finalScore').textContent = `Final Score: ${finalScore}`;

                // Show high score message if new record
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
        this.baseScrollSpeed = 3;
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
        this.cheatCodeEnabled = false; // Reset cheat code on restart
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('highScoreMessage').style.display = 'none';

        // Restart background music from beginning
        this.backgroundMusic.currentTime = 0;
    }

    startGame() {
        this.gameStarted = true;
        document.getElementById('startScreen').style.display = 'none';
        this.startBackgroundMusic();
    }

    animate(currentTime) {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame((time) => this.animate(time));
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); 