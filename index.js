import { el } from '@elemaudio/core';
import { default as core } from '@elemaudio/node-renderer';
import ca from './cellauto.cjs';
import chalk from 'chalk';
import teoria from 'teoria';

class Generations {
    constructor(steps, rows, liveRule, dieRule, density, states) {
        this.currentStep = 0;

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
            },
            getState: function () {
                return this.state;
            },
            process: function (neighbors) {
                let surrounding = this.countSurroundingCellsWithValue(neighbors, 'living');
                if (this.state <= 0 && this.options.liveRule.includes(surrounding)) {
                    this.state = 1;
                } else if (this.state > 0 && this.options.dieRule.includes(surrounding)) {
                    this.state -= 1 / this.options.states;
                }
                if (this.state < 0) {
                    this.state = 0;
                }
            },
            reset: function () {
                this.living = this.state > 0;
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

    update(log = false) {
        this.world.step();

        if (log) {
            for (let y = 0; y < this.world.height; y++) {
                let t = [];
                for (let x = 0; x < this.world.width; x++) {
                    let v = this.world.grid[y][x].getState();
                    let c = chalk.black(v);
                    if (v > 0 && v < 0.1) {
                        c = chalk.red(v);
                    } else if (v >= 0.1) {
                        c = chalk.green(v);
                    }
                    t.push(c);
                }
                console.log(t.join(chalk.blue('|')));

            }
            console.log('+++++++++++++++++');
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

const liveRule = [0, 2, 3];
const dieRule = [1, 4, 5, 6, 7];
const density = 0.2;
const states = 16;
const rates = [1, 0.75, 0.5, 0.25];
const grids = [new Generations(8, 4, liveRule, dieRule, density, states)];

const bpm = 120;
const rate = 60000 / bpm;

let baseNote = teoria.note.fromKey(12 + Math.round(Math.random() * 24));
let accentNote = teoria.note.fromKey(baseNote.key() + 12);
let scaleType = ['major', 'minor', 'lydian', 'mixolydian', 'phrygian'][Math.round(Math.random() * 3)];
let scale = accentNote.scale(scaleType).notes().concat(baseNote.scale(scaleType).notes());

core.on('load', () => {
    grids.forEach((grid, i) => {
        setInterval(() => {
            let r = rates[Math.floor(grid.out(2) * (rates.length - 1))];
            let gate = el.metro({ interval: Math.floor(rate * r), name: i });
            let notes = grid.row(0).map(function (v) {
                return scale[Math.floor(v * (scale.length - 1))].fq();
            });
            let noteSeq = el.seq({ key: 'n' + i, seq: notes, hold: true }, gate, 0);
            let gates = grid.row(1);
            let gateSeq = el.seq({ key: 'g' + i, seq: gates, hold: true }, gate, 0);
            let adsr = el.select(
                el.ge(gateSeq, 0),
                el.adsr(0.01, rate, gateSeq, 0.1, gate),
                el.smooth(el.tau2pole(0.02), el.const({ value: 0 }))
              )
            let o = el.mul(
                el.cycle(noteSeq),
                adsr
            );
            let out = el.mul(o, 0.1);
            core.render(out, out);
        }, 5);
    });
    /*
    let s = grid.row(0).map(function (e) {
        return e + 32;
    });
    let n = el.seq({seq: s}, el.metro({interval: rate}), 0);
    let o = el.cycle(m2f(n));
    core.render(el.mul(o, 0.1));
    */
});

core.on('metro', function (e) {
    grids[e.source].step(true);
});

core.initialize();