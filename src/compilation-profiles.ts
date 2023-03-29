import {
  commands,
  ExtensionContext,
  QuickPickItem,
  StatusBarAlignment,
  Uri,
  window,
  workspace
} from 'vscode';

import {ClangdContext} from './clangd-context';

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

    if (configuration) {
      const cppConfiguration =
          configuration.configurations.find(conf => conf.language === 'c++');

      let currentProfile =
          extensionContext.workspaceState.get<string>(COMPILATION_PROFILE_KEY);

      if (cppConfiguration) {
        if (!currentProfile) {
          await extensionContext.workspaceState.update(
              COMPILATION_PROFILE_KEY, cppConfiguration.defaultProfile);
          currentProfile = cppConfiguration.defaultProfile;
        }

        const statusBarItem =
            window.createStatusBarItem(StatusBarAlignment.Right);
        statusBarItem.text = `Compilation profile: ${currentProfile}`;
        statusBarItem.show();

        commands.registerCommand('cpp.compilation-profiles.show', async () => {
          const options: QuickPickItem[] =
              cppConfiguration.compilationProfiles.map(
                  profile => (
                      {label: profile.name, description: profile.description}));
          const newProfile = await window.showQuickPick(
              options, {title: 'Choose new compilation profile'});

          if (newProfile) {
            await clangdContext.client.sendNotification(
                'workspace/didChangeConfiguration',
                {settings: {compilationProfile: newProfile.label}});
          }
          await extensionContext.workspaceState.update(COMPILATION_PROFILE_KEY,
                                                       newProfile?.label);
          statusBarItem.text = `Compilation profile: ${newProfile?.label}`
        });

        statusBarItem.command = 'cpp.compilation-profiles.show';
      }
    }
  }
}