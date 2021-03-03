import { Config, Logger } from '@jsprismarine/prismarine';
import { EventManager } from '@jsprismarine/prismarine/dist/events/EventManager';
import { RaknetConnectEvent, RaknetEncapsulatedPacketEvent } from '@jsprismarine/prismarine/dist/events/Events';
import PlayerManager from '@jsprismarine/prismarine/dist/player/PlayerManager';
import { Listener, Connection, InetAddress, Protocol } from '@jsprismarine/raknet';
import Identifiers from '@jsprismarine/raknet/dist/protocol/Identifiers';

import { getLogger } from './sleepingLogger';
import { Settings } from './sleepingSettings';

const Address = '0.0.0.0';
const Version = '1.16.201';

export class SleepingBedrock {

    settings: Settings;
    logger: Logger;
    listener?: Listener;
    listenerBuilder: Listener;
    playerManager: PlayerManager;
    private readonly eventManager = new EventManager();
    playerConnectionCallBack: () => void;

    constructor(settings: Settings, playerConnectionCallBack: () => void) {
        this.settings = settings;

        this.playerConnectionCallBack = playerConnectionCallBack;

        this.logger = getLogger() as Logger;
        const config = new Config(Version);
        (config as any).motd = settings.serverName
        const server = {
            getConfig() { return config },
            getIdentifiers() { return Identifiers },
            getLogger: () => { return this.logger; },
            getPlayerManager: () => { return this.playerManager }
        };
        this.playerManager = new PlayerManager(server as any);
        this.listenerBuilder = new Listener(server)
    }

    async init() {

        this.listener = await this.listenerBuilder.listen(Address, this.settings.bedrockPort);
        this.logger.info(`[BedRock] Listening on ${Address}:${this.settings.bedrockPort}`);


        this.listener.on('openConnection', this.handleOpenConnection);
        this.listener.on('closeConnection', async (inetAddr: InetAddress, reason: string) => { this.logger.info(`[BedRock] closeConnection ${JSON.stringify(inetAddr)} ${reason}`) });
        this.listener.on('encapsulated', this.handleEncapsulated);
        // this.listener.on('raw', async (buffer: Buffer, inetAddr: InetAddress) => { this.logger.info(`raw ${JSON.stringify(inetAddr)} ${JSON.stringify(buffer)}`) });

        this.eventManager.on('raknetConnect', this.handleRaknetConnect);
    }

    handleOpenConnection = async (connection: Connection) => {
        this.logger.info(`[BedRock] openConnection ${JSON.stringify(connection.getState())}`)
        const event = new RaknetConnectEvent(connection);
        await this.eventManager.emit('raknetConnect', event);
    };

    handleRaknetConnect = async (raknetConnectEvent: RaknetConnectEvent) => {
        this.logger.info(`[BedRock] raknetConnect ${raknetConnectEvent}`);
        const connection = raknetConnectEvent.getConnection();
        connection.disconnect(this.settings.loginMessage);
        await connection.close();
        await this.close();
        this.playerConnectionCallBack();
    }

    handleEncapsulated = async (packet: Protocol.EncapsulatedPacket, inetAddr: InetAddress) => {
        this.logger.info(`encapsulated ${JSON.stringify(inetAddr)}`)
        const event = new RaknetEncapsulatedPacketEvent(inetAddr, packet);
        await this.eventManager.emit('raknetEncapsulatedPacket', event);
    }

    async close() {
        this.logger.info(`[BedRock] Closing`);
        if (this.listener) {
            await this.listener.kill();
            await new Promise(resolve => {
                this.listener!.getSocket().close(() => {
                    this.logger.info(`[BedRock] Closed`);
                    resolve('closed');
                });
            });
            this.listener = undefined;
        }
    }

}