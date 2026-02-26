const { readdirSync, readFileSync, writeFileSync, existsSync } = require("fs-extra");
const path = require("path");
const { exec } = require("child_process");

const execPromise = (cmd, options) => new Promise((resolve, reject) => {
    exec(cmd, options, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
    });
});

const { log, loading, getText, colors, removeHomeDir } = global.utils;
const { GoatBot } = global;
const { configCommands } = GoatBot;
const regExpCheckPackage = /require\s*\(\s*[`'"]([^`'"]+)[`'"]\s*\)/g;
const packageAlready = [];
const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let count = 0;

module.exports = async function (api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, createLine) {
    const aliasesData = await globalData.get('setalias', 'data', []);
    if (aliasesData) {
        for (const data of aliasesData) {
            const { aliases, commandName } = data;
            for (const alias of aliases) {
                const lowAlias = alias.toLowerCase();
                if (GoatBot.aliases.has(lowAlias)) continue;
                GoatBot.aliases.set(lowAlias, commandName.toLowerCase());
            }
        }
    }

    const folders = ["cmds", "events"];
    for (const folderModules of folders) {
        const isCmd = folderModules == "cmds";
        console.log(colors.hex("#f5ab00")(createLine(isCmd ? "NX LOAD COMMANDS" : "NX LOAD EVENTS")));

        const typeEnv = isCmd ? "envCommands" : "envEvents";
        const setMap = isCmd ? "commands" : "eventCommands";
        const fullPath = path.normalize(process.cwd() + `/scripts/${folderModules}`);

        if (!existsSync(fullPath)) continue;

        const files = readdirSync(fullPath).filter(file =>
            file.endsWith(".js") &&
            !file.endsWith("eg.js") &&
            (process.env.NODE_ENV == "development" ? true : !file.match(/(dev)\.js$/g)) &&
            !configCommands[isCmd ? "commandUnload" : "commandEventUnload"]?.includes(file)
        );

        let successCount = 0;
        const errors = [];

        for (const file of files) {
            const pathCmd = path.join(fullPath, file);
            try {
                const content = readFileSync(pathCmd, "utf8");
                let packages = content.match(regExpCheckPackage);
                
                if (packages) {
                    for (let p of packages) {
                        let pkg = p.match(/[`'"]([^`'"]+)[`'"]/)[1];
                        if (pkg.startsWith('.') || path.isAbsolute(pkg)) continue;
                        
                        pkg = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0];
                        
                        if (!packageAlready.includes(pkg) && !existsSync(`${process.cwd()}/node_modules/${pkg}`)) {
                            packageAlready.push(pkg);
                            const loadingInterval = setInterval(() => {
                                loading.info('PACKAGE', `${spinner[count++ % spinner.length]} Installing ${colors.yellow(pkg)}...`);
                            }, 80);
                            
                            await execPromise(`npm install ${pkg} --save`);
                            clearInterval(loadingInterval);
                            console.log(`${colors.green('✔')} Installed ${pkg}`);
                        }
                    }
                }

                const command = require(pathCmd);
                if (!command.config || !command.config.name) throw new Error("Missing config or name");
                
                const cmdName = command.config.name.toLowerCase();
                if (GoatBot[setMap].has(cmdName)) throw new Error(`Duplicate command: ${cmdName}`);

                if (command.config.envConfig) {
                    if (!configCommands[typeEnv]) configCommands[typeEnv] = {};
                    configCommands[typeEnv][cmdName] = { ...command.config.envConfig, ...configCommands[typeEnv][cmdName] };
                }

                if (command.config.aliases) {
                    for (const alias of command.config.aliases) {
                        const lowAlias = alias.toLowerCase();
                        if (!GoatBot.aliases.has(lowAlias)) GoatBot.aliases.set(lowAlias, cmdName);
                    }
                }

                if (command.onLoad) await command.onLoad({ api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData });
                if (command.onChat) GoatBot.onChat.push(cmdName);
                if (command.onEvent) GoatBot.onEvent.push(cmdName);

                command.location = pathCmd;
                GoatBot[setMap].set(cmdName, command);
                successCount++;
            } catch (err) {
                errors.push({ file, err });
            }
        }
        
        loading.info('LOADED', `${colors.green(successCount)} loaded, ${colors.red(errors.length)} failed`);
        errors.forEach(e => console.log(colors.red(`✖ ${e.file}: `) + e.err.message));
    }
};
