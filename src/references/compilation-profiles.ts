import * as vscode from 'vscode';
import {
  commands,
  ExtensionContext,
  QuickPickItem,
  StatusBarAlignment,
  Uri,
  window,
  workspace
} from 'vscode';
import {Location} from 'vscode-languageserver-protocol';
import {
  DidChangeConfigurationNotification
} from 'vscode-languageclient';
import {ClangdContext} from '../clangd-context';
import {ReferencesTreeData} from "./references-tree-data";
import {ClientStorage, dvfsExtensionApi, parseDvfsUri, RemoteRootContext} from "./DVFSTypes";
import {readDataFromStorage, updateDataInStorage} from "./utils";

export const COMPILATION_PROFILE_KEY = 'sudu-cpp-compilation-profile';

type CompilationProfile = {
  name: string,
  description: string,
  arguments: string[]
}

type LanguageConfiguration = {
  language: string,
  buildTool: string,
  dockerImage: string,
  defaultProfile: string,
  compilationProfiles: CompilationProfile[]
}

type Configuration = {
  configurations: LanguageConfiguration[]
}

export type LocationWithProfiles = vscode.Location & { profiles: string[] };
export type LspLocationWithProfiles = Location & { profiles: string[] };

export async function getCompilationProfiles(extensionContext: ExtensionContext,
                                             clangdContext: ClangdContext) {
  const folders = workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    const workspaceFolder = folders[0].uri;
    const configUri =
      Uri.joinPath(workspaceFolder, '.sudu/project_configuration.json');
    const fileContent = await workspace.fs.readFile(configUri);
    const fileContentJson = Buffer.from(fileContent).toString('utf-8');

    const configuration = JSON.parse(fileContentJson) as Configuration;

    const parsed = parseDvfsUri(workspaceFolder);
    if (!parsed) throw new Error(`Failed to parse uri: ${workspaceFolder}`);

    const connectionContext: RemoteRootContext | undefined = dvfsExtensionApi().resolveRoot(
      parsed.remoteRootId,
    );

    if (!connectionContext) {
      throw new Error(`Failed to resolve remote root id: ${parsed.remoteRootId}`);
    }

    const storage = connectionContext.components.get<ClientStorage>(
      dvfsExtensionApi().getDIKeys().ClientStorage,
    );

    if (configuration) {
      const cppConfiguration =
        configuration.configurations.find(conf => conf.language === 'c++');

      let currentProfile = readDataFromStorage<string>(
        storage,
        COMPILATION_PROFILE_KEY,
        connectionContext.id,
      );

      if (cppConfiguration) {
        if (!currentProfile) {
          await updateDataInStorage<string>(
            storage,
            COMPILATION_PROFILE_KEY,
            parsed.remoteRootId,
            cppConfiguration.defaultProfile
          );
          currentProfile = cppConfiguration.defaultProfile;
        }

        const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right);
        statusBarItem.text = `Compilation profile: ${currentProfile}`;
        statusBarItem.show();

        if (currentProfile) {
          await clangdContext.client.sendNotification(
            DidChangeConfigurationNotification.type,
            {settings: {}}
          );
        }

        commands.registerCommand('cpp.compilation-profiles.show', async () => {
          const options: QuickPickItem[] =
            cppConfiguration.compilationProfiles.map(
              profile => (
                {label: profile.name, description: profile.description}));
          const newProfile = await window.showQuickPick(
            options, {title: 'Choose new compilation profile'});

          if (newProfile && newProfile.label !== readDataFromStorage<string>(storage, COMPILATION_PROFILE_KEY, parsed.remoteRootId)) {
            await clangdContext.client.sendNotification(
              DidChangeConfigurationNotification.type,
              {settings: {}}
            );

            await updateDataInStorage(storage, COMPILATION_PROFILE_KEY, parsed.remoteRootId, newProfile?.label);
            statusBarItem.text = `Compilation profile: ${newProfile?.label}`;
          }
        });

        statusBarItem.command = 'cpp.compilation-profiles.show';
      }

      extensionContext.subscriptions.push(commands.registerCommand(
        'sudu.clangd.referencesInAllProfiles', async () => {
          if (!vscode.window.activeTextEditor) {
            return;
          }

          const textDocument = vscode.window.activeTextEditor.document
          const position = vscode.window.activeTextEditor.selection.active;
          const searchItem = textDocument.getText(textDocument.getWordRangeAtPosition(position));

          const profiles =
            cppConfiguration
              ? cppConfiguration.compilationProfiles.map(
                profile => profile.name)
              : [];

          window.withProgress({
            location: {viewId: 'references-in-profiles.tree'},
            title: 'Finding references'
          }, async () => {
            const locationsWithProfile = (await clangdContext.client.sendRequest<LspLocationWithProfiles[]>(
              'textDocument/referencesAll',
              {
                ...clangdContext.client.code2ProtocolConverter
                  .asReferenceParams(textDocument, position,
                    {includeDeclaration: false}),
                profiles
              })).map(loc => {
              return {
                profiles: loc.profiles,
                ...clangdContext.client.protocol2CodeConverter.asLocation(loc)
              }
            });

            window.registerTreeDataProvider('references-in-profiles.tree', new ReferencesTreeData(locationsWithProfile, searchItem));
            commands.executeCommand('setContext', 'references-in-profiles.isActive', true);
            commands.executeCommand(`references-in-profiles.tree.focus`);
          })
        }));
    }
  }
}