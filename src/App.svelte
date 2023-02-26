<script>
    import { el } from "@elemaudio/core";
    import WebRenderer from "@elemaudio/web-renderer";
    import * as PIXI from "pixi.js";
    import ca from './cellauto.cjs';
    import teoria from 'teoria';
    import { defineHex, Grid, Orientation, rectangle } from "honeycomb-grid";

    const ctx = new AudioContext();
    const core = new WebRenderer();

    const app = new PIXI.Application({ resizeTo: window, backgroundAlpha: 1, backgroundColor: 0x2980b9 });
    // @ts-ignore
    document.getElementById('app').appendChild(app.view);

    // Wicki–Hayden:
    // - top/bottom (point to point) is an octave
    // - left/right is a whole step
    // - top-left/bottom-right is a fourth
    // - top-right/bottom-left is a fifth
    //
    // Harmonic:
    // - top/bottom is a perfect fifth
    // - left/right is a half step
    // - top-left/bottom-right is a minor third
    // - top-right/bottom-left is a major third

    // If true, uses the harmonic layout, that is flat-topped
    // If false, uses the Wicki–Hayden layout, that is pointy-topped
    const harmonic = true;

    // you may want the origin to be the top left corner of a hex's bounding box
    // instead of its center (which is the default)
    const Hex = defineHex({ dimensions: 20, origin: "topLeft", orientation: harmonic ? Orientation.FLAT : Orientation.POINTY });

    class Generations {
        constructor(steps, rows, liveRule, dieRule, density, states, loops, xPos, yPos) {
            this.currentStep = 0;
            this.currentLoop = 0;
            this.loops = loops;

            this.container = new PIXI.Container();
            this.container.x = xPos;
            this.container.y = yPos;
            app.stage.addChild(this.container);

            this.grid = new Grid(Hex, rectangle({ width: steps, height: rows }));

            this.world = new ca.World({
                width: steps,
                height: rows,
                options: {
                    hexTiles: true,
                    flatTopped: harmonic,
                    liveRule: liveRule,
                    dieRule: dieRule,
                    density: density,
                    states: states,
                },
            });

            this.world.registerCellType('generations', {
                init: function (options, hex) {
                    this.options = options;
                    this.hex = hex;
                    this.text = this.hex.row + ',' + this.hex.col;
                    this.graphics = new PIXI.Graphics();
                    const t = new PIXI.Text(this.text,
                    {
                        fontFamily : 'Arial',
                        fontSize: 14,
                        fill: 'red',
                        align: 'right'
                    });
                    t.anchor.set(0.5, 0.5);
                    t.position.set(this.hex.x, this.hex.y);
                    this.graphics.addChild(t);
                    this.randomize();
                },
                getState: function () {
                    return this.state;
                },
                getGraphics: function () {
                    return this.graphics;
                },
                setText: function (text) {
                    this.text = text;
                },
                setState: function (state) {
                    this.state = state;
                    this.graphics.clear();
                    this.graphics.beginFill(new PIXI.Color([this.state, this.state, this.state]).toHex());
                    this.graphics.drawPolygon(this.hex.corners);
                    this.graphics.endFill();
                },
                randomize: function () {
                    this.setState(Math.random() <= this.options.density ? Math.random() : 0);
                    this.initState = this.state;
                },
                process: function (neighbors) {
                    const surrounding = this.countSurroundingCellsWithValue(neighbors, 'living');
                    let state = this.state;
                    if (!this.living && this.options.liveRule.includes(surrounding)) {
                        //state = 1;
                        state = Math.random() <= this.options.density ? 1 : Math.random();
                    } else if (this.living && this.options.dieRule.includes(surrounding)) {
                        state = this.state - (1 / this.options.states);
                    }
                    if (state < 0) {
                        state = 0;
                    }
                    if (state !== this.state) {
                        this.setState(state);
                    }
                },
                reset: function () {
                    this.living = this.state > 0;
                },
                loop: function() {
                    this.setState(this.initState);
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
                    this.container.addChild(this.world.grid[y][x].getGraphics());
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

        update() {
            this.currentLoop++;
            if (this.currentLoop === this.loops) {
                this.reset();
            } else {
                this.world.step();
            }
        }

        step() {
            this.currentStep++;
            if (this.currentStep === this.world.width) {
                this.currentStep = 0;
                this.update();
            }
        }

        row(y) {
            return this.world.grid[y].map(c => c.getState());
        }

        out(y) {
            return this.world.grid[y][this.currentStep].getState();
        }
    }

    class Sequencer {
        constructor(idx, ca, rate) {
            this.idx = idx;
            this.ca = ca;
            this.rate = rate;
            this.autoDuration = false;
        }

        setRate(rate) {
            this.rate = rate;
        }

        clock() {
            // @ts-ignore
            return el.metro({ name: this.idx, interval: this.rate });
        }

        out() {
            return this.ca.row(0);
        }
    }

    class Voice {
        constructor(noteSeq, gateSeq, rateSeq) {
            this.noteSeq = noteSeq;
            this.gateSeq = gateSeq;
            this.rateSeq = rateSeq;
            this.autoDuration = false;
        }

        out() {
            // noteSeq
            // - random cell = root note for each step
            // - cell value is velocity
            // - ring(s) around the root note define the available chord notes,
            //   up to a limit (may be one, just the root)
            // - more rings = more notes span


            const rSeq = el.seq({ key: 'r', seq: this.rateSeq.out(), hold: true }, this.gateSeq.clock(), 0);
            if (this.autoDuration) {
                let int = this.rateSeq.rate;
                const rateRow = this.rateSeq.out();
                let r = rate / rateRow.length;
                let med = rateRow.reduce((a, b) => a + b) / rateRow.length;
                if (med > 0) {
                    let p = (r / med) * this.rateSeq.out(2);
                    int = p * rateRow.length;
                    if (int <= 0) {
                        int = rate;
                    }
                }

                this.noteSeq.setRate(int);
                this.gateSeq.setRate(int);
            }

            const gSeq = el.seq({ key: 'g', seq: this.gateSeq.out(), hold: true }, this.gateSeq.clock(), 0);
            let adsr = el.select(
                el.ge(gSeq, 0.1),
                el.adsr(0.02, this.gateSeq.rate / 1000, gSeq, 0.02, this.gateSeq.clock()),
                el.sm(0)
            )

            const notes = this.noteSeq.out().map(v => {
                return scale[Math.floor(v * (scale.length - 1))].fq();
            });
            const nSeq = el.seq({ key: 'n', seq: notes, hold: true }, this.noteSeq.clock(), 0);

            return el.mul(
                el.cycle(nSeq),
                adsr
            );
        }
    }

    const baseNote = teoria.note.fromKey(24 + Math.round(Math.random() * 24));
    const accentNote = teoria.note.fromKey(baseNote.key() + 12);
    const scaleType = ['major', 'minor', 'lydian', 'mixolydian', 'phrygian'][Math.round(Math.random() * 4)];
    const scale = accentNote.scale(scaleType).notes().concat(baseNote.scale(scaleType).notes());

    const liveRule = [3];
    const dieRule = [2, 4, 5];
    const density = 0.2;
    const states = 4;
    const loops = 0;

    const noteCA = new Generations(8, 8, liveRule, dieRule, density, states, loops, 0, 0);
    const gateCA = new Generations(8, 8, liveRule, dieRule, density, states, loops, 500, 0);
    const rateCA = new Generations(8, 8, liveRule, dieRule, density, states, loops, 1000, 0);

    const bpm = 120;
    const rate = (60000 / 4) / bpm;
    const noteSeq = new Sequencer(0, noteCA, rate);
    const gateSeq = new Sequencer(1, gateCA, rate);
    const rateSeq = new Sequencer(2, rateCA, rate);
    const sequencers = [noteSeq, gateSeq, rateSeq];
    const voices = [new Voice(noteSeq, gateSeq, rateSeq)];

    // Clicking on the document initializes the web audio backend and restarts the
    // visualization.
    //
    // We need this step because most browsers deny an AudioContext from starting
    // before some user-initiated interaction.
    let initialized = false;
    document.addEventListener("pointerdown", async function start(e) {
        if (initialized) {
            sequencers.forEach(seq => {
                seq.ca.randomize();
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
                setInterval(() => {
                    let o;
                    voices.forEach((voice, i) => {
                        /*
                        let int = rate;
                        if (voice.autoDuration) {
                            const rateRow = rateSeq.row(2);
                            let r = rate / rateRow.length;
                            let med = rateRow.reduce((a, b) => a + b) / rateRow.length;
                            if (med > 0) {
                                let p = (r / med) * rateSeq.out(2);
                                int = p * rateRow.length;
                                if (int <= 0) {
                                    int = rate;
                                }
                            }
                        }
                        // @ts-ignore
                        let gate = el.metro({ interval: int, name: i });
                        let notes = noteSeq.row(0).map(v => {
                            return scale[Math.floor(v * (scale.length - 1))].fq();
                        });
                        let ns = el.seq({ key: 'n' + i, seq: notes, hold: true }, gate, 0);
                        let gates = gateSeq.row(1);
                        let gs = el.seq({ key: 'g' + i, seq: gates, hold: true }, gate, 0);
                        let adsr = el.select(
                            el.ge(gs, 0.1),
                            el.adsr(0.02, rate / 1000, gs, 0.02, gate),
                            el.sm(0)
                        )
                        let o = el.mul(
                            el.cycle(ns),
                            adsr
                        );
                        */
                        o = el.add(voice.out());
                    });

                    let out = el.mul(o, 0.5);
                    out = el.delay({size: 44100}, el.smooth(el.tau2pole(0.1), el.ms2samps(rate)), 0.5, out);
                    core.render(out, out);
                }, rate);
            });

            core.on('metro', function (e) {
                sequencers[e.source].ca.step();
            });

            initialized = true;
        }
    });
</script>