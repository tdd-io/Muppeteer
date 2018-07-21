const path = require('path');
const request = require('request-promise-native');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { CONSOLE_PREFIX } = require('./consoleHelpers');
const { checkDependency } = require('./checkDependencies');

require('colors');

const composePath = path.join(__dirname, '../../docker-compose.yml');

const runCommand = async (command, args) => {
    try {
        const { stdout, stderr } = await exec(`${command} ${args.join(' ')}`);

        console.log(stdout);
        console.log(stderr);

        return stdout;
    } catch (e) {
        console.error(e);
        return e;
    }
};

const dockerBuild = async () => {
    try {
        console.log(`${CONSOLE_PREFIX} Building Docker image...`.green);
        await runCommand('docker-compose', [
            '-f',
            `"${composePath}"`,
            'build',
            '--pull'
        ]);
        console.log(`${CONSOLE_PREFIX} Successfully built Docker image`.green);
    } catch (exitCode) {
        console.error(
            `${CONSOLE_PREFIX} (Exit code ${exitCode}) Failed to build Docker image`
                .red
        );
    }
};

const dockerUp = async () => {
    try {
        console.log(`${CONSOLE_PREFIX} Starting Docker container...`.green);
        await runCommand('docker-compose', [
            '-f',
            `"${composePath}"`,
            'up',
            '-d'
        ]);
        console.log(
            `${CONSOLE_PREFIX} Successfully started Docker container`.green
        );
    } catch (exitCode) {
        console.error(
            `${CONSOLE_PREFIX} (Exit code ${exitCode}) Failed to start Docker container`
                .red
        );
    }
};

const dockerDown = async () => {
    try {
        console.log(
            `${CONSOLE_PREFIX} Shutting down Docker container...`.green
        );
        await runCommand('docker-compose', ['-f', `"${composePath}"`, 'down']);
        console.log(
            `${CONSOLE_PREFIX} Successfully shutdown Docker container`.green
        );
    } catch (exitCode) {
        console.error(
            `${CONSOLE_PREFIX} (Exit code ${exitCode}) Failed to shut down Docker container`
                .red
        );
    }
};

const contactChrome = async ({ config, maxAttempts }) => {
    let count = 1;
    console.log(`${CONSOLE_PREFIX} Contacting Chrome in container...`.green);

    async function tryRequest() {
        try {
            return await request(config);
        } catch (e) {
            count += 1;
            if (count <= maxAttempts) {
                return new Promise(resolve => {
                    setTimeout(async () => {
                        console.log(
                            `${CONSOLE_PREFIX} Attempt #${count}`.yellow
                        );
                        resolve(await tryRequest());
                    }, 500);
                });
            }
            console.log(
                `${CONSOLE_PREFIX} Max number of attempts exceeded. I'm giving up!`
                    .red
            );
            throw e;
        }
    }

    return tryRequest();
};

const dockerRun = async () => {
    if (!checkDependency('docker', true)) {
        process.exit(1);
    }

    await dockerBuild();
    await dockerUp();

    const res = await contactChrome({
        config: {
            uri: `http://localhost:9222/json/version`,
            json: true,
            resolveWithFullResponse: true
        },
        maxAttempts: 5
    });

    const webSocketUri = res.body.webSocketDebuggerUrl;
    console.log(
        `${CONSOLE_PREFIX} Connected to WebSocket URL: ${webSocketUri}`.green
    );

    if (process.send) {
        process.send({
            tag: 'STDOUT_HOOK_WS',
            value: webSocketUri
        });
    }

    return webSocketUri;
};

module.exports = {
    dockerShutdownChrome: dockerDown,
    dockerRunChrome: dockerRun
};
