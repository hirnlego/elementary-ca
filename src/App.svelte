<script>
    import { el } from "@elemaudio/core";
    import WebRenderer from "@elemaudio/web-renderer";
    import * as PIXI from "pixi.js";
    import ca from './cellauto.cjs';
    import teoria from 'teoria';
    import { defineHex, Grid, rectangle } from "honeycomb-grid";

    const ctx = new AudioContext();
    const core = new WebRenderer();

    // you may want the origin to be the top left corner of a hex's bounding box
    // instead of its center (which is the default)
    const Hex = defineHex({ dimensions: 30, origin: "topLeft" });

    class Generations {
        constructor(steps, rows, liveRule, dieRule, density, states, loops) {
            this.currentStep = 0;
            this.currentLoop = 0;
            this.loops = loops;

            this.grid = new Grid(Hex, rectangle({ width: steps, height: rows }));

            this.world = new ca.World({
                width: steps,
                height: rows,
                options: {
                    hexTiles: true,
                    liveRule: liveRule,
                    dieRule: dieRule,
                    density: density,
                    states: states,
                },
            });

            this.world.registerCellType('generations', {
                init: function (options, hex) {
                    this.options = options;
                    this.randomize();
                    this.hex = hex;
                },
                getState: function () {
                    return this.state;
                },
                render: function () {
                    const [firstCorner, ...otherCorners] = this.hex.corners;

                    graphics.moveTo(firstCorner.x, firstCorner.y);
                    graphics.beginFill(new PIXI.Color([this.state, this.state, this.state]).toHex());
                    graphics.lineStyle(0);
                    otherCorners.forEach(({ x, y }) => graphics.lineTo(x, y));
                    graphics.lineTo(firstCorner.x, firstCorner.y);
                    graphics.closePath();
                    graphics.endFill();

                    app.stage.addChild(graphics);
                },
                randomize: function () {
                    this.state = Math.random() <= this.options.density ? Math.random() : 0;
                    this.initState = this.state;
                },
                process: function (neighbors) {
                    let surrounding = this.countSurroundingCellsWithValue(neighbors, 'living');
                    if (!this.living && this.options.liveRule.includes(surrounding)) {
                        this.state = 1;
                    } else if (this.living && this.options.dieRule.includes(surrounding)) {
                        this.state -= 1 / this.options.states;
                    }
                    if (this.state < 0) {
                        this.state = 0;
                    }
                },
                reset: function () {
                    this.living = this.state > 0;
                },
                loop: function() {
                    this.state = this.initState;
                }
            }, function () {
                //init
                this.state = 0;
            });

            this.world.initialize([
                { name: 'generations', distribution: 100 }
            ]);

            for (let y = 0; y < this.world.height; y++) {
                for (let x = 0; x < this.world.width; x++) {
                    this.world.grid[y][x].init(this.world.options, this.grid.getHex({ col: x, row: y }));
                }
            }
        }

        randomize() {
            for (let y = 0; y < this.world.height; y++) {
                for (let x = 0; x < this.world.width; x++) {
                    this.world.grid[y][x].randomize();
                }
            }
        }

        reset() {
            for (let y = 0; y < this.world.height; y++) {
                for (let x = 0; x < this.world.width; x++) {
                    this.world.grid[y][x].loop();
                }
            }
            this.currentLoop = 0;
        }

        update(log = false) {
            this.currentLoop++;
            if (this.currentLoop === this.loops) {
                this.reset();
            } else {
                this.world.step();
            }

            if (log) {
                for (let y = 0; y < this.world.height; y++) {
                    for (let x = 0; x < this.world.width; x++) {
                        let v = this.world.grid[y][x].getState() * 255;
                        this.world.grid[y][x].render();
                    }
                }
            }
        }

        step(log = false) {
            this.currentStep++;
            if (this.currentStep === this.world.width) {
                this.currentStep = 0;
                this.update(log);
            }
        }

        row(y) {
            return this.world.grid[y].map(c => c.getState());
        }

        out(y) {
            return this.world.grid[y][this.currentStep].getState();
        }
    }

    const liveRule = [3];
    const dieRule = [4, 5];
    const density = 0.2;
    const states = 8;
    const loops = 0;
    const grids = [new Generations(8, 8, liveRule, dieRule, density, states, loops)];

    const bpm = 120;
    const rate = (60000 / 4) / bpm;
    const autoDuration = false;

    let baseNote = teoria.note.fromKey(24 + Math.round(Math.random() * 24));
    let accentNote = teoria.note.fromKey(baseNote.key() + 12);
    let scaleType = ['major', 'minor', 'lydian', 'mixolydian', 'phrygian'][Math.round(Math.random() * 4)];
    let scale = accentNote.scale(scaleType).notes().concat(baseNote.scale(scaleType).notes());

    const app = new PIXI.Application({ backgroundAlpha: 0 });
    const graphics = new PIXI.Graphics();

    document.body.appendChild(app.view);

    // Clicking on the document initializes the web audio backend and restarts the
    // visualization.
    //
    // We need this step because most browsers deny an AudioContext from starting
    // before some user-initiated interaction.
    let initialized = false;
    document.addEventListener("pointerdown", async function start(e) {
        if (initialized) {
            grids.forEach(grid => {
                grid.randomize();
            });
        } else {
            if (ctx.state !== "running") {
                await ctx.resume();
            }

            let node = await core.initialize(ctx, {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2],
            });

            node.connect(ctx.destination);

            core.on("load", function () {
                grids.forEach((grid, i) => {
                    setInterval(() => {
                        let int = rate;
                        if (autoDuration) {
                            let r = rate / grid.row(2).length;
                            let med = grid.row(2).reduce((a, b) => a + b) / grid.row(2).length;
                            if (med > 0) {
                                let p = (r / med) * grid.out(2);
                                int = p * grid.row(2).length;
                                if (int <= 0) {
                                    int = rate;
                                }
                            }
                        }
                        let gate = el.metro({ interval: int, name: i });
                        let notes = grid.row(0).map(v => {
                            return scale[Math.floor(v * (scale.length - 1))].fq();
                        });
                        let noteSeq = el.seq({ key: 'n' + i, seq: notes, hold: true }, gate, 0);
                        let gates = grid.row(1);
                        let gateSeq = el.seq({ key: 'g' + i, seq: gates, hold: true }, gate, 0);
                        let adsr = el.select(
                            el.ge(gateSeq, 0.1),
                            el.adsr(0.02, rate / 1000, gateSeq, 0.02, gate),
                            el.sm(0)
                        )
                        let o = el.mul(
                            el.cycle(noteSeq),
                            adsr
                        );
                        let out = el.mul(o, 0.5);
                        out = el.delay({size: 44100}, el.smooth(el.tau2pole(0.1), el.ms2samps(rate)), 0.5, out);
                        core.render(out, out);
                    }, rate);
                });
            });

            core.on('metro', function (e) {
                grids[e.source].step(true);
            });

            initialized = true;
        }
    });
</script>

<main />
