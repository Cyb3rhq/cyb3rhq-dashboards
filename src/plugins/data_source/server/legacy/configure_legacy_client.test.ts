/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsClientContract } from '../../../../core/server';
import { loggingSystemMock, savedObjectsClientMock } from '../../../../core/server/mocks';
import { DATA_SOURCE_SAVED_OBJECT_TYPE } from '../../common';
import { AuthType, DataSourceAttributes } from '../../common/data_sources';
import { DataSourcePluginConfigType } from '../../config';
import { CryptographyClient } from '../cryptography';
import { DataSourceClientParams, LegacyClientCallAPIParams } from '../types';
import { OpenSearchClientPoolSetup } from '../client';
import { ConfigOptions } from 'elasticsearch';
import { ClientMock, parseClientOptionsMock } from './configure_legacy_client.test.mocks';
import { configureLegacyClient } from './configure_legacy_client';

const DATA_SOURCE_ID = 'a54b76ec86771ee865a0f74a305dfff8';
const cryptographyClient = new CryptographyClient('test', 'test', new Array(32).fill(0));

// TODO: improve UT
describe('configureLegacyClient', () => {
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;
  let config: DataSourcePluginConfigType;
  let savedObjectsMock: jest.Mocked<SavedObjectsClientContract>;
  let clientPoolSetup: OpenSearchClientPoolSetup;
  let configOptions: ConfigOptions;
  let dataSourceAttr: DataSourceAttributes;

  let mockOpenSearchClientInstance: {
    close: jest.Mock;
    ping: jest.Mock;
  };
  let dataSourceClientParams: DataSourceClientParams;
  let callApiParams: LegacyClientCallAPIParams;
  let decodeAndDecryptSpy: jest.SpyInstance<Promise<string>, [encrypted: string]>;

  const mockResponse = { data: 'ping' };

  beforeEach(() => {
    mockOpenSearchClientInstance = {
      close: jest.fn(),
      ping: jest.fn(),
    };
    logger = loggingSystemMock.createLogger();
    savedObjectsMock = savedObjectsClientMock.create();
    config = {
      enabled: true,
      clientPool: {
        size: 5,
      },
    } as DataSourcePluginConfigType;

    configOptions = {
      host: 'http://localhost',
      ssl: {
        rejectUnauthorized: true,
      },
    } as ConfigOptions;

    dataSourceAttr = {
      title: 'title',
      endpoint: 'http://localhost',
      auth: {
        type: AuthType.UsernamePasswordType,
        credentials: {
          username: 'username',
          password: 'password',
        },
      },
    } as DataSourceAttributes;

    clientPoolSetup = {
      getClientFromPool: jest.fn(),
      addClientToPool: jest.fn(),
    };

    callApiParams = {
      endpoint: 'ping',
    };

    savedObjectsMock.get.mockResolvedValueOnce({
      id: DATA_SOURCE_ID,
      type: DATA_SOURCE_SAVED_OBJECT_TYPE,
      attributes: dataSourceAttr,
      references: [],
    });

    dataSourceClientParams = {
      dataSourceId: DATA_SOURCE_ID,
      savedObjects: savedObjectsMock,
      cryptographyClient,
    };

    ClientMock.mockImplementation(() => mockOpenSearchClientInstance);

    mockOpenSearchClientInstance.ping.mockImplementation(function mockCall(this: any) {
      return Promise.resolve({
        context: this,
        response: mockResponse,
      });
    });

    decodeAndDecryptSpy = jest
      .spyOn(cryptographyClient, 'decodeAndDecrypt')
      .mockResolvedValue('password');
  });

  afterEach(() => {
    ClientMock.mockReset();
    jest.resetAllMocks();
  });

  test('configure client with auth.type == no_auth, will call new Client() to create client', async () => {
    savedObjectsMock.get.mockReset().mockResolvedValueOnce({
      id: DATA_SOURCE_ID,
      type: DATA_SOURCE_SAVED_OBJECT_TYPE,
      attributes: {
        ...dataSourceAttr,
        auth: {
          type: AuthType.NoAuth,
        },
      },
      references: [],
    });

    parseClientOptionsMock.mockReturnValue(configOptions);

    await configureLegacyClient(
      dataSourceClientParams,
      callApiParams,
      clientPoolSetup,
      config,
      logger
    );

    expect(parseClientOptionsMock).toHaveBeenCalled();
    expect(ClientMock).toHaveBeenCalledTimes(1);
    expect(ClientMock).toHaveBeenCalledWith(configOptions);
    expect(savedObjectsMock.get).toHaveBeenCalledTimes(1);
  });

  test('configure client with auth.type == no_auth, will first call decrypt()', async () => {
    const mockResult = await configureLegacyClient(
      dataSourceClientParams,
      callApiParams,
      clientPoolSetup,
      config,
      logger
    );

    expect(ClientMock).toHaveBeenCalledTimes(1);
    expect(savedObjectsMock.get).toHaveBeenCalledTimes(1);
    expect(decodeAndDecryptSpy).toHaveBeenCalledTimes(1);
    expect(mockResult).toBeDefined();
  });

  test('correctly called with endpoint and params', async () => {
    const mockParams = { param: 'ping' };
    const mockResult = await configureLegacyClient(
      dataSourceClientParams,
      { ...callApiParams, clientParams: mockParams },
      clientPoolSetup,
      config,
      logger
    );

    expect(mockResult.response).toBe(mockResponse);
    expect(mockResult.context).toBe(mockOpenSearchClientInstance);
    expect(mockOpenSearchClientInstance.ping).toHaveBeenCalledTimes(1);
    expect(mockOpenSearchClientInstance.ping).toHaveBeenLastCalledWith(mockParams);
  });
});
