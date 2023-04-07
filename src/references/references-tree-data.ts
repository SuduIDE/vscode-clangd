import {ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri, workspace} from "vscode";
import {LocationWithProfiles} from "./compilation-profiles";
import {getPreviewChunks} from "./utils";

type SearchItem = {
  item: string;
}
type FileInfo = {
  uri: Uri,
  profile: ProfileName
};
type ProfileName = string;

export class ReferencesTreeData implements TreeDataProvider<ProfileName | FileInfo | LocationWithProfiles | SearchItem> {
  constructor(private locationsWithProfiles: LocationWithProfiles[], private searchItem: string) {
  }

  getChildren(element?: ProfileName | FileInfo): ProviderResult<(ProfileName | FileInfo | LocationWithProfiles | SearchItem)[]> {
    if (!element) {
      // root, return all profiles
      const profiles: string[] = [];
      this.locationsWithProfiles.forEach(loc => {
        profiles.push(...loc.profiles);
      });

      return [{item: this.searchItem}, ...new Set(profiles)];
    }

    if (typeof element === 'string') {
      // profile, return files
      return [
        // get unique files
        ...new Set(this.locationsWithProfiles
          .filter(loc => loc.profiles.includes(element))
          .map(loc => loc.uri.toString()))
      ]
        .map(u => ({uri: Uri.parse(u), profile: element}));
    }

    // file, return locations
    return this.locationsWithProfiles.filter(loc => loc.profiles.includes(element.profile) && loc.uri.toString() === element.uri.toString());
  }

  getTreeItem(element: ProfileName | FileInfo | LocationWithProfiles | SearchItem): TreeItem | Thenable<TreeItem> {
    if (typeof element === 'string') {
      // profile
      return {collapsibleState: TreeItemCollapsibleState.Expanded, label: `Profile: ${element}`};
    }

    if (this.isSearchItem(element)) {
      const description = 'Looking for references: ';
      return {collapsibleState: TreeItemCollapsibleState.None,
        label: {
          label: `${description}${element.item}`,
          highlights: [[description.length, description.length + element.item.length]]
        }
      };
    }

    if (this.isFileInfo(element)) {
      // file
      return {collapsibleState: TreeItemCollapsibleState.Expanded, label: element.uri.path.split('/').pop()};
    }

    // location
    return workspace.openTextDocument(element.uri).then(textDocument => {
      const chunks = getPreviewChunks(textDocument, element.range);

      return {
        collapsibleState: TreeItemCollapsibleState.None,
        label: {
          label: chunks.before + chunks.inside + chunks.after,
          highlights: [[chunks.before.length, chunks.before.length + chunks.inside.length]]
        },
        command: {
          title: 'Open',
          command: 'vscode.open',
          arguments: [element.uri, {selection: element.range}]
        }
      };
    });
  }

  isSearchItem(value: any): value is SearchItem {
    return 'item' in value;
  }

  isFileInfo(value: any): value is FileInfo {
    return 'uri' in value && 'profile' in value;
  }

}