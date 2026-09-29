// In its own file to avoid circular dependencies
import { getConfigDirName } from '../../utils/configDir.js'
export const FILE_EDIT_TOOL_NAME = 'Edit'

// Permission pattern for granting session-level access to the project's .atlas/ folder
export const ATLAS_FOLDER_PERMISSION_PATTERN = `/${getConfigDirName()}/**`

// Permission pattern for granting session-level access to the global ~/.atlas/ folder
export const GLOBAL_ATLAS_FOLDER_PERMISSION_PATTERN = `~/${getConfigDirName()}/**`

export const FILE_UNEXPECTEDLY_MODIFIED_ERROR =
  'File has been unexpectedly modified. Read it again before attempting to write it.'
