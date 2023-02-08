import { el } from '@elemaudio/core';
import { default as core } from '@elemaudio/node-renderer';
import ca from './cellauto.cjs';
import chalk from 'chalk';
import teoria from 'teoria';

chalk.level = 2;

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

const liveRule = [2, 3, 4];
const dieRule = [5, 6, 7, 8];
const density = 0.5;
const states = 8;
const rates = [2, 1.5, 1, 0.5];
const grids = [new Generations(8, 8, liveRule, dieRule, density, states)];

const bpm = 120;
const rate = 60000 / bpm;

let baseNote = teoria.note.fromKey(12 + Math.round(Math.random() * 24));
let accentNote = teoria.note.fromKey(baseNote.key() + 12);
let scaleType = ['major', 'minor', 'lydian', 'mixolydian', 'phrygian'][Math.round(Math.random() * 4)];
let scale = accentNote.scale(scaleType).notes().concat(baseNote.scale(scaleType).notes());

core.on('load', () => {
    grids.forEach((grid, i) => {
        setInterval(() => {
            //let r = rates[Math.floor(grid.out(2) * (rates.length - 1))];
            let r = rates[2];
            let gate = el.metro({ interval: Math.floor(rate * r), name: i });
            let notes = grid.row(0).map(function (v) {
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
            //let t = rates[Math.floor(grid.out(3) * (rates.length - 1))];
            let t = rates[3];
            let out = el.mul(o, 0.1);
            out = el.delay({size: 44100}, el.smooth(el.tau2pole(0.1), el.ms2samps(rate * t)), 0.7, out);
            core.render(out, out);
        }, 5);
    });
});

core.on('metro', function (e) {
    grids[e.source].step(true);
});

core.initialize();