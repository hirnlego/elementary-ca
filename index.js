import { el } from '@elemaudio/core';
import { default as core } from '@elemaudio/node-renderer';
import ca from './cellauto.cjs';
import chalk from 'chalk';
import teoria from 'teoria';

chalk.level = 2;

class Generations {
    constructor(steps, rows, liveRule, dieRule, density, states, loops) {
        this.currentStep = 0;
        this.currentLoop = 0;
        this.loops = loops;

        this.world = new ca.World({
            width: steps,
            height: rows,
            options: {
                liveRule: liveRule,
                dieRule: dieRule,
                density: density,
                states: states,
            },
        });

        this.world.registerCellType('generations', {
            init: function (options) {
                this.options = options;
                this.state = Math.random() <= this.options.density ? Math.random() : 0;
                this.initState = this.state;
            },
            getState: function () {
                return this.state;
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
                this.world.grid[y][x].init(this.world.options);
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
                let t = [];
                for (let x = 0; x < this.world.width; x++) {
                    let v = this.world.grid[y][x].getState() * 255;
                    t.push(chalk.rgb(v, v, v).inverse('  '));
                }
                console.log(t.join(''));

            }
            console.log();
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

const liveRule = [3, 4];
const dieRule = [7, 8];
const density = 0.5;
const states = 8;
const loops = 4;
const grids = [new Generations(8, 8, liveRule, dieRule, density, states, loops)];

const bpm = 120;
const rate = (60000 / 4) / bpm;
const autoDuration = false;

let baseNote = teoria.note.fromKey(24 + Math.round(Math.random() * 24));
let accentNote = teoria.note.fromKey(baseNote.key() + 12);
let scaleType = ['major', 'minor', 'lydian', 'mixolydian', 'phrygian'][Math.round(Math.random() * 4)];
let scale = accentNote.scale(scaleType).notes().concat(baseNote.scale(scaleType).notes());

function median(numbers) {
    const sorted = Array.from(numbers).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}

core.on('load', () => {
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

core.initialize();