import {ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState, window, workspace} from "vscode";
import {LocationWithProfiles} from "./compilation-profiles";
import {getPreviewChunks} from "./utils";

export class ReferencesTreeData implements TreeDataProvider<string | LocationWithProfiles> {
  private references: Map<string, LocationWithProfiles[]> = new Map();

  constructor(locationsWithProfiles: LocationWithProfiles[]) {
    locationsWithProfiles.forEach(location => {
      const uri = location.uri.toString()
      const existing = this.references.get(uri) || [];
      this.references.set(uri, [...existing, location]);
    });
  }


  getChildren(element?: string): ProviderResult<(string | LocationWithProfiles)[]> {
    if (!element) {
      return [...this.references.keys()];
    }

    const locations = this.references.get(element);
    if (locations) {
      return locations;
    }

    return undefined;
  }

  getTreeItem(element: string | LocationWithProfiles): TreeItem | Thenable<TreeItem> {
    if (typeof element === 'string') {
      return {collapsibleState: TreeItemCollapsibleState.Expanded, label: element.split('/').pop()};
    }

    return workspace.openTextDocument(element.uri).then(textDocument => {
      const chunks = getPreviewChunks(textDocument, element.range);

      return {
        collapsibleState: TreeItemCollapsibleState.None,
        label: {
          label: chunks.before + chunks.inside + chunks.after,
          highlights: [[chunks.before.length, chunks.before.length + chunks.inside.length]]
        },
        description: element.profiles.join(', '),
        command: {
          title: 'Open',
          command: 'vscode.open',
          arguments: [element.uri, {selection: element.range}]
        }
      };
    });


  }

}