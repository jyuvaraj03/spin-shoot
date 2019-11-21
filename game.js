let game;
let gameOptions = {

    // width of the path, in pixels
    pathWidth: 500,

    // height of the path, in pixels
    pathHeight: 800,

    // radius of path curves, in pixels
    curveRadius: 50,

    // amount of targets in game
    maxTargets: 5,

    // min and max milliseconds needed by the targets
    // to run all the way around the path
    targetSpeed: {
        min: 6000,
        max: 10000,
        default: 8000
    },

    // min and max target size, in pixels
    targetSize: {
        min: 100,
        max: 200
    },

    // milliseconds needed by the gun to rotate by 360 degrees
    gunSpeed: 5000,

    // multiplier to be applied to gun rotation speed each time
    // the gun fires
    gunThrust: 2,

    // maximum gun speed multiplier.
    // If gunSpeed is 5000 and maxGunSpeedMultiplier is 5,
    // maximum gun rotation will allow to rotate by 360 degrees
    // in 5000/5 seconds
    maxGunSpeedMultiplier: 5,

    // gunFriction will reduce gun rotating speed each time the gun
    // completes a 360 degrees rotation
    gunFriction: 0.9,

    // score increment for every successful hit
    scoreIncrement: 1,

    // maximum score increment allowed
    maxScoreIncrement: 10,

    // maximum ammo count
    maxAmmo: 6
}
window.onload = function() {
    let gameConfig = {
        type: Phaser.AUTO,
        backgroundColor: 0x222222,
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            parent: "thegame",
            width: 750,
            height: 1334
        },
        scene: playGame
    }
    game = new Phaser.Game(gameConfig);
    window.focus();
}
class playGame extends Phaser.Scene{
    constructor(){
        super("PlayGame");
        this.score = 0;
        this.multiplier = 1;
        this.ammoLeft = gameOptions.maxAmmo;
        this.gameOver = false;
        this.targetCountWeightArray = this.getTargetCountWeightArray();
        console.log(this.targetCountWeightArray);
    }
    preload(){
        this.load.image("tile", "tile.png");
        this.load.image("gun", "gun.png");
        this.load.image("fireline", "fireline.png");
    }
    create(){
        // determine the offset to make path always stand in the center of the stage
        let offset = new Phaser.Math.Vector2((game.config.width - gameOptions.pathWidth) / 2, (game.config.height - gameOptions.pathHeight) / 2);

        this.createNewPath(offset);

        // fireLine is the bullet trajectory
        this.fireLine = this.add.sprite(game.config.width / 2, game.config.height / 2, "fireline");
        this.fireLine.setOrigin(0, 0.5);
        this.fireLine.displayWidth = 700;
        this.fireLine.displayHeight = 8;
        this.fireLine.visible = false;

        // the rotating gun
        this.gun = this.add.sprite(game.config.width / 2, game.config.height / 2, "gun");

        // the group of targets
        this.targets = this.add.group();

        // calculations for number of good and bad targets 
        // weightedPick favours picking the earlier elements in the array
        this.targetCount = Phaser.Math.RND.weightedPick(this.targetCountWeightArray);
        this.badTargetIndices = this.getBadTargetIndices();

        for(let i = 0; i < this.targetCount; i++){
            // target aren't sprites but followers!!!!
            let target = this.add.follower(this.path, offset.x + gameOptions.curveRadius, offset.y, "tile");
            target.alpha = 0.8;
            target.displayWidth = Phaser.Math.RND.between(gameOptions.targetSize.min, gameOptions.targetSize.max)

            // marking the target as bad if it is in the badTargetIndices list
            if (this.badTargetIndices.includes(i)) {
                target.tint = 0xff0000;
                target.setData('isBad', true);
            }

            this.targets.add(target);

            // the core of the script: targets run along the path starting from a random position
            let positionOffset = Phaser.Math.RND.realInRange(-0.05,0.05);
            let position = i * (1.0 / this.targetCount) + positionOffset;
            target.startFollow({
                duration: gameOptions.targetSpeed.default,
                repeat: -1,
                rotateToPath: true,
                verticalAdjust: true,
                startAt: position
            });
        }

        // place score on the upper right
        this.scoreText = this.add.text(game.config.width - 30, 30, '0', { fontSize: '72px', align: 'right' }).setOrigin(1, 0);


        // tween to rotate the gun
        this.gunTween = this.tweens.add({
            targets: [this.gun],
            angle: 360,
            duration: gameOptions.gunSpeed,
            repeat: -1,
            callbackScope: this,
            onRepeat: function(){

                // each round, gun angular speed decreases
                this.gunTween.timeScale = Math.max(1, this.gunTween.timeScale * gameOptions.gunFriction);
            }
        });



        // waiting for user input
        this.input.on("pointerdown", function(pointer){
            // we say we can fire when the fire line is not visible
            if(!this.fireLine.visible && !this.gameOver){
                this.fireLine.visible = true;
                this.fireLine.angle = this.gun.angle;

                // gun angular speed increases
                this.gunTween.timeScale = Math.min(gameOptions.maxGunSpeedMultiplier, this.gunTween.timeScale * gameOptions.gunThrust);

                // fire line disappears after 75 milliseconds
                this.time.addEvent({
                    delay: 75,
                    callbackScope: this,
                    callback: function(){
                        this.fireLine.visible = false;
                    }
                });

                // remove one ammo
                this.ammoLeft -= 1;

                // calculate the line of fire starting from sprite angle
                let radians = Phaser.Math.DegToRad(this.fireLine.angle);
                let fireStartX = game.config.width / 2;
                let fireStartY = game.config.height / 2;
                let fireEndX = fireStartX + game.config.height / 2 * Math.cos(radians);
                let fireEndY = fireStartY + game.config.height / 2 * Math.sin(radians);
                let lineOfFire = new Phaser.Geom.Line(fireStartX, fireStartY, fireEndX, fireEndY);
                let hit = false;
                // loop through all targets
                this.targets.getChildren().forEach(function(target){
                    if(target.visible){

                        // get target bounding box
                        let bounds = target.getBounds();

                        // check if the line intersect the bounding box
                        if(Phaser.Geom.Intersects.LineToRectangle(lineOfFire, bounds)){

                            // target HIT!!!! hide it for 3 seconds
                            // TODO: if (target.data.values.type === BAD) { this.gameOver = true; return; }
                            target.visible = false;
                            hit = true;

                            // if target is bad, remove all ammo and stop checking other targets
                            if (target.getData('isBad')) {
                                this.ammoLeft = 0;
                                return;
                            }
                            this.score += gameOptions.scoreIncrement * this.multiplier;
                            this.multiplier = Math.min(this.multiplier + 1, gameOptions.maxScoreIncrement);
                            this.scoreText.setText(this.score + ' ' + this.ammoLeft);

                            
                        } 
                    }
                }.bind(this));

                // all the targets are missed by the fireline
                if (!hit) {
                    // reset the multiplier
                    this.multiplier = 1;
                    this.scoreText.setText(this.score + ' ' + this.ammoLeft);
                }
            }
            if (this.ammoLeft === 0 || this.gameOver) {
                this.gameOver = true;
                this.add.text(200, 200, "GAME OVER", { fontSize: '72px' });
            }
        }, this);
    }

    createNewPath(offset) {
        // building a path using lines and ellipses. Ellipses are used to create
        // circle arcs and build the curves
        this.path = new Phaser.Curves.Path(offset.x + gameOptions.curveRadius, offset.y);
        this.path.lineTo(offset.x + gameOptions.pathWidth - gameOptions.curveRadius, offset.y);
        this.path.ellipseTo(-gameOptions.curveRadius, -gameOptions.curveRadius, 90, 180, false, 0);
        this.path.lineTo(offset.x + gameOptions.pathWidth, offset.y + gameOptions.pathHeight - gameOptions.curveRadius);
        this.path.ellipseTo(-gameOptions.curveRadius, -gameOptions.curveRadius, 180, 270, false, 0);
        this.path.lineTo(offset.x + gameOptions.curveRadius, offset.y + gameOptions.pathHeight);
        this.path.ellipseTo(-gameOptions.curveRadius, -gameOptions.curveRadius, 270, 0, false, 0);
        this.path.lineTo(offset.x, offset.y + gameOptions.curveRadius);
        this.path.ellipseTo(-gameOptions.curveRadius, -gameOptions.curveRadius, 0, 90, false, 0);

        this.drawPath();
    }

    drawPath() {
        // drawing the path
        this.graphics = this.add.graphics();
        this.graphics.lineStyle(4, 0xffff00, 1);
        this.path.draw(this.graphics);
    }

    getTargetCountWeightArray() {
        // initialising targetCountWeightArray
        // elements in the front are more likely to be picked
        // used to calculate number of targets
        // if for example maxTargets is 6, targetCountWeightArray is [4, 5, 3, 6, 2]
        let temp = Phaser.Utils.Array.NumberArray(2,gameOptions.maxTargets);
        let arr = [];
        while (temp.length > 0) {
            arr.push(temp[Math.floor(temp.length / 2)]);
            temp.splice(temp.length / 2, 1);
        }
        return arr;
    }

    getBadTargetIndices() {
        let badTargetCountWeightArray = this.targetCount > 4 ? [1, 2] : [0, 1];
        let badTargetCount = Phaser.Math.RND.weightedPick(badTargetCountWeightArray);
        let badTargetIndices = [];
        let badTargetChoices = Phaser.Utils.Array.NumberArray(0,this.targetCount);    // e.g. [0,1,2,3] if targetCount = 4
        for (let i = 0; i < badTargetCount; i++) {
            let badTargetChoice = Phaser.Math.RND.pick(badTargetChoices);
            badTargetIndices.push(badTargetChoice);
            // removing chosen badTargetChoice from the list of choices
            badTargetChoices.splice(badTargetChoice, 1);
        }
        return badTargetIndices;
    }

    easeOut() {
        console.log("YO im here");
    }
};
