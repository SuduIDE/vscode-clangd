import * as vscode from 'vscode';
import * as config from "../config";

export const DVFS_SCHEME = 'sudu';

export type RemoteRootId = string;

export interface RemoteRootContext {
  readonly host: string
  readonly rootId: string
  revisionId: number,
  readonly id: RemoteRootId
}

export type SnapshotInfo = {
  host: string,
  rootId: string,
  revision: number
};

export type RemotePath = SnapshotInfo & { path: string };

export function getDVFSHostByWebHost(webHost: string): string {
  const config = dvfsExtensionApi().getConfiguration() as Configuration;
  const index = config.connections.findIndex(connection => connection.webEndpoint === webHost);
  if (index < 0) {
    throw new Error('Cannot match web and dvfs endpoints');
  }

  const dvfsEndpoint = config.connections[index].dvfsEndpoint;

  if (dvfsEndpoint === undefined) {
    throw new Error(`DVFS endpoint for ${webHost} is not specified`);
  }

  return dvfsEndpoint;
}

export function getWebHostByDvfsHost(dvfsHost: string): string {
  const config = dvfsExtensionApi().getConfiguration() as Configuration;
  const index = config.connections.findIndex(connection => connection.dvfsEndpoint === dvfsHost);
  if (index < 0) {
    throw new Error('Cannot match web and dvfs endpoints');
  }

  const webEndpoint = config.connections[index].webEndpoint;

  if (webEndpoint === undefined) {
    throw new Error(`Web endpoint for ${dvfsHost} is not specified`);
  }

  return webEndpoint;
}

export function dvfsExtensionApi() {
  const api = vscode.extensions.getExtension('sudu.dvfs')?.exports;
  if (!api) {
    throw new Error('DVFS Extension API is not available');
  }

  return api;
}

export type DvfsUri = {
  remoteRootId: string,
  uri: vscode.Uri
};

export function parseDvfsUri(uri: vscode.Uri): DvfsUri | undefined {
  if (!uri.path.startsWith('/') || uri.scheme !== 'sudu') return undefined;
  const remainedPathStart = uri.path.indexOf('/', 1);
  const path = remainedPathStart >= 0 ? uri.path.substring(remainedPathStart) : '/';
  const remoteRootIdEnd = remainedPathStart >= 0 ? remainedPathStart : undefined;
  const remoteRootId = uri.path.substring(1, remoteRootIdEnd);
  return {
    uri: vscode.Uri.from({path, scheme: uri.scheme, authority: uri.authority}),
    remoteRootId,
  };
}

enum UriParts {
  HOST = 0,
  ROOT = 1,
  REVISION = 2,
  PROFILE_AND_PATH = 3,
}

export const URI_DELIMITER = '~';

export function parseClangdUri(value: string): RemotePath & { profileName: string } {
  // sudu://localhost:2020@rootuuid@revision@profile/src/Polygon.cpp
  // sudu://localhost:28081~300pb585gz9i41ynygtq08yv9p~2~Debug/B.h
  const [scheme, rest] = value.split('://');
  if (scheme !== DVFS_SCHEME) {
    throw new Error(`Incorrect URI ${value}`);
  }

  const parts = rest.split(URI_DELIMITER);
  const host = parts[UriParts.HOST];
  const rootId = parts[UriParts.ROOT];
  const revision = +parts[UriParts.REVISION];
  const profileAndPath = parts[UriParts.PROFILE_AND_PATH];
  const [profileName, ...pathArray] = profileAndPath.split('/');
  const path = `/${pathArray.join('/')}`;

  return {
    host, rootId, revision, profileName, path,
  };
}

export type Connection = {
  name?: string,
  webEndpoint?: string,
  dvfsEndpoint?: string,
  cppCodeModelEndpoint?: string,
  cppProjectModelEndpoint?: string
};

export interface Configuration {
  readonly connections: Connection[]
}

const CODE_MODEL_INDEX = '--background-index-db-address';
const PROJECT_MODEL_INDEX = '--compile-commands-address';
const DVFS_ADDRESS = '--distributed-file-system-address';

export function getSuduConfiguration(webHost: string): string[] {
  const settings = new Map(config.get<string[]>('arguments').map(setting => {
    const parts = setting.split('=');
    return [parts[0], parts[1]];
  }));

  const suduConfig = dvfsExtensionApi().getConfiguration() as Configuration;
  const connectionSettings = suduConfig.connections.find(connection => connection.webEndpoint === webHost);
  if (connectionSettings) {
    if (connectionSettings.dvfsEndpoint) {
      settings.set(DVFS_ADDRESS, connectionSettings.dvfsEndpoint);
    }

    if (connectionSettings.cppCodeModelEndpoint) {
      settings.set(CODE_MODEL_INDEX, connectionSettings.cppCodeModelEndpoint);
    }

    if (connectionSettings.cppProjectModelEndpoint) {
      settings.set(PROJECT_MODEL_INDEX, connectionSettings.cppProjectModelEndpoint);
    }
  }

  const result: string[] = [];

  settings.forEach( (value, key) => {
    const setting = value ? `${key}=${value}` : key;
    result.push(setting)
  } );

  return result;
}