"use strict"

let serialport = require('serialport')

let formatFreq = (frq) => {
    let
        maj = frq.substring(0, 4),
        min = frq.substring(4)
    while (maj.startsWith('0')) maj = maj.substring(1)
    while (min.endsWith('0')) min = min.slice(0, -1)
    return `${maj}.${min}`
}

let indexBank = (i) => 1 + Math.floor(i / 30)
let indexChan = (i) => i % 30

let formatIndex = (i) => {
    return `${indexBank(i)}/${indexChan(i)}`
}

if (process.argv.length < 4) {
    console.error(`Usage:

    node uniden.js <portdev> <command>
    
Commands:

    vermdl  dump version and model
    freq    dump all used memory banks

Available ports:
`)
    serialport.list((err, ports) => {
        ports.map((p) => {
            console.error(`    ${p.comName}`)
        })
    })
} else {
    let sp = new serialport.SerialPort(
        process.argv[2],
        {
            baudRate: 57600,
            parser: serialport.parsers.readline('\r')
        }
    )
    let rcb = () => {}

    let execCmd = (cmd, callback) => {
        rcb = (data) => {
            callback(null, data)
        }
        sp.write(`${cmd}\r`)
    }
    
    // get version
    let execVER = (callback) => {
        execCmd('VER', (e, data) => {
            let ver = /^VER,(.*)$/.exec(data)
            if (ver) {
                callback(null, ver[1])
            } else {
                callback('bad answer')
            }
        })
    }
    
    // get model
    let execMDL = (callback) => {
        execCmd('MDL', (e, data) => {
            let ver = /^MDL,(.*)$/.exec(data)
            if (ver) {
                callback(null, ver[1])
            } else {
                callback('bad answer')
            }
        })
    }
    
    // enter programming mode
    let execPRG = (callback) => {
        execCmd('PRG', (e, data) => {
            if (e) return callback(e)
            if (data == 'PRG,OK') {
                callback(null)
            } else {
                console.error(data)
                callback('PRG error')
            }
        })
    }
    
    // exit programming mode
    let execEPG = (callback) => {
        execCmd('EPG', (e, data) => {
            if (e) return callback(e)
            if (data == 'EPG,OK') {
                callback(null)
            } else {
                callback('EPG error')
            }
        })
    }

    // get/set channel info
    let execCIN = (data, callback) => {
        let cmd
        if ('frq' in data) {
            
        } else {
            cmd = `CIN,${data.index}`
        }
        execCmd(cmd, (e, data) => {
            let cin = /^CIN,([0-9]{1,3}),,([0-9]{8}),(AM|FM),,(0|1),(0|1),(0|1)$/.exec(data)
            if (cin) {
                callback(null, {
                    index: cin[1],
                    frq: cin[2],
                    mod: cin[3],
                    dly: cin[4],
                    lout: cin[5],
                    pri: cin[6]
                })
            } else {
                callback('bad answer')
            }
        })
    }    

    sp.on('open', () => {
        console.error(' -- port opened')
        let tasks = []
        tasks.push((callback) => {
            execPRG(callback)
        })
        let task = (t) => {
            switch (t) {
                case 'vermdl':
                    tasks.push((callback) => {
                        execMDL((e, model) => {
                            if (e) return callback(e)
                            process.stdout.write(`# Model: ${model}\n`)
                            callback(null)
                        })
                    })
                    tasks.push((callback) => {
                        execVER((e, version) => {
                            if (e) return callback(e)
                            process.stdout.write(`# Version: ${version}\n`)
                            callback(null)
                        })
                    })
                    break
                case 'freq':
                    for (let ind = 1; ind <= 300; ind++) {
                        tasks.push((callback) => {
                            if (indexChan(ind) == 1) {
                                process.stdout.write(`#\n# Bank ${indexBank(ind)}\n#\n`)
                            }
                            execCIN({index: ind}, (e, data) => {
                                if (e) return callback(e)
                                if (data.frq != '00000000') {
                                    process.stdout.write(`${formatIndex(ind)},${formatFreq(data.frq)},${data.mod},${data.dly},${data.lout},${data.pri}\n`)
                                }
                                callback(null)
                            })
                        })
                    }
                    break;
                default:
                    console.error(' -- wrong command')
            }
        }
        task(process.argv[3])
        tasks.push((callback) => {
            execEPG(callback)
        })
        tasks.push((callback) => {
            sp.close()
            callback(null)
        })
        let execNextTask = (e) => {
            if (e) process.stderr.write(e)
            if (tasks.length) {
                let t = tasks.shift()
                t(execNextTask)
            }
        }
        execNextTask()
    })
    sp.on('data', (data) => {
        rcb(data)
    })
    sp.on('close', () => {
        console.error(' -- port closed')
    })
}

