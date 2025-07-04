// AuthContext/AuthProvider.tsx

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import AuthContext from './AuthContext';
import type {
  AuthContextType,
  User,
  LoginRequest,
  Workspace,
  TeamspaceListItem,
  UserRelationships,
  UserTeam,
  UserOrganization,
  Lab,
} from './authTypes';
import { authService } from './authService';
import { workspaceService } from '../../services/workspaceService';
import { userService, type ExtendedUserData } from '../../services/userService';
import { relationshipService } from '../../services/relationshipService';
import { labService } from '../../services/labService';

// Constants for localStorage keys
const CURRENT_TEAM_STORAGE_KEY = 'futurity_current_team';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [extendedUser, setExtendedUser] = useState<ExtendedUserData | null>(
    null
  );
  const [token, setToken] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [teamspaces, setTeamspaces] = useState<TeamspaceListItem[]>([]);
  const [currentTeamspace, setCurrentTeamspace] =
    useState<TeamspaceListItem | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true);

  // New relationship states
  const [userRelationships, setUserRelationships] =
    useState<UserRelationships | null>(null);
  const [currentTeam, setCurrentTeamState] = useState<UserTeam | null>(null);
  const [currentOrganization, setCurrentOrganization] =
    useState<UserOrganization | null>(null);

  // Whiteboard state - just the uniqueID
  const [whiteboardId, setWhiteboardId] = useState<string | null>(null);

  // Lab states
  const [currentTeamLabs, setCurrentTeamLabs] = useState<Lab[]>([]);
  const [isLoadingLabs, setIsLoadingLabs] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Team persistence functions
  const saveCurrentTeamToStorage = (team: UserTeam | null) => {
    try {
      if (team) {
        localStorage.setItem(
          CURRENT_TEAM_STORAGE_KEY,
          JSON.stringify({
            _id: team._id,
            uniqueID: team.uniqueID,
            ent_name: team.ent_name,
            ent_fsid: team.ent_fsid,
            metadata: team.metadata,
            status: team.status,
            createdAt: team.createdAt,
            updatedAt: team.updatedAt,
            user_relationships: team.user_relationships,
          })
        );
        console.log('Saved current team to localStorage:', team.ent_name);
      } else {
        localStorage.removeItem(CURRENT_TEAM_STORAGE_KEY);
        console.log('Removed current team from localStorage');
      }
    } catch (error) {
      console.error('Failed to save current team to localStorage:', error);
    }
  };

  const loadCurrentTeamFromStorage = (): UserTeam | null => {
    try {
      const storedTeam = localStorage.getItem(CURRENT_TEAM_STORAGE_KEY);
      if (storedTeam) {
        const parsed = JSON.parse(storedTeam);
        console.log('Loaded team from localStorage:', parsed.ent_name);
        return parsed;
      }
    } catch (error) {
      console.error('Failed to load current team from localStorage:', error);
    }
    return null;
  };

  // Load labs for current team
  const loadLabsForCurrentTeam = async (team: UserTeam, userToken: string) => {
    if (!team || !userToken) {
      setCurrentTeamLabs([]);
      return;
    }

    try {
      setIsLoadingLabs(true);
      console.log('Loading labs for team:', team.ent_name);

      const labs = await labService.getLabsForTeam(
        team.uniqueID,
        userToken,
        false // don't include archived labs
      );

      setCurrentTeamLabs(labs);
      console.log(`Loaded ${labs.length} labs for team:`, team.ent_name);
    } catch (error) {
      console.error('Failed to load labs for current team:', error);
      setCurrentTeamLabs([]);
    } finally {
      setIsLoadingLabs(false);
    }
  };

  // Enhanced setCurrentTeam function with persistence and lab loading
  const setCurrentTeam = async (team: UserTeam | null) => {
    console.log('Setting current team:', team?.ent_name || 'null');
    setCurrentTeamState(team);
    saveCurrentTeamToStorage(team);

    // Load labs for the new team
    if (team && token) {
      await loadLabsForCurrentTeam(team, token);
    } else {
      setCurrentTeamLabs([]);
    }
  };

  // Refresh labs function
  const refreshLabs = async (): Promise<void> => {
    if (!currentTeam || !token) {
      setCurrentTeamLabs([]);
      return;
    }

    try {
      await loadLabsForCurrentTeam(currentTeam, token);
    } catch (error) {
      console.error('Failed to refresh labs:', error);
      throw error;
    }
  };

  // Load extended user data after basic auth
  const loadExtendedUserData = async (basicUser: User, userToken: string) => {
    try {
      console.log('Loading extended user data for user ID:', basicUser._id);
      const extendedData = await userService.getExtendedUserData(
        basicUser._id,
        userToken
      );
      setExtendedUser(extendedData);

      // CRITICAL: Merge extended data with basic user data BUT NEVER overwrite the _id
      const mergedUser: User = {
        ...basicUser,
        ...extendedData,
        // ALWAYS preserve the original auth context user ID
        _id: basicUser._id,
        // Preserve other auth-specific fields from the basic user
        auth_key: basicUser.auth_key,
        guid: basicUser.guid,
      };
      setUser(mergedUser);

      console.log(
        'Extended user data loaded successfully, preserved original _id:',
        basicUser._id
      );
    } catch (error) {
      console.error('Failed to load extended user data:', error);
      // Keep the basic user data if extended fetch fails
      console.log(
        'Using basic user data only due to extended data fetch failure'
      );
    }
  };

  // Load whiteboard data after user is authenticated
  const loadWhiteboardData = async (basicUser: User, userToken: string) => {
    try {
      console.log('Loading whiteboard data for user ID:', basicUser._id);

      const whiteboardData = await userService.getUserWhiteboard(
        basicUser._id,
        userToken
      );

      setWhiteboardId(whiteboardData.uniqueID);

      console.log(
        'Whiteboard data loaded successfully:',
        whiteboardData.uniqueID
      );
    } catch (error) {
      console.error('Failed to load whiteboard data:', error);

      // If whiteboard doesn't exist (404), we could optionally create one
      if (error instanceof Error && error.message.includes('not found')) {
        console.log(
          'No whiteboard found for user, this is normal for new users'
        );
      }

      // Don't throw here, just log the error
      // User can still use the app without whiteboard data
      setWhiteboardId(null);
    }
  };

  // Load relationship data after user is authenticated
  const loadRelationshipData = async (basicUser: User, userToken: string) => {
    try {
      console.log('Loading relationship data for user ID:', basicUser._id);

      // Get user's organizations and teams
      const relationships = await relationshipService.getUserRelationships(
        basicUser._id,
        userToken
      );

      setUserRelationships({
        organizations: relationships.organizations,
        teams: relationships.teams,
      });

      // Set current organization (use first if available)
      if (relationships.organizations.length > 0) {
        setCurrentOrganization(relationships.organizations[0]);
      }

      // Handle team selection with persistence
      await handleTeamSelection(relationships.teams, userToken);

      console.log('Relationship data loaded successfully');
    } catch (error) {
      console.error('Failed to load relationship data:', error);
      // Don't throw here, just log the error
      setUserRelationships(null);
      setCurrentTeamState(null);
      setCurrentOrganization(null);
      setCurrentTeamLabs([]);
    }
  };

  // Handle team selection with persistence logic
  const handleTeamSelection = async (
    availableTeams: UserTeam[],
    userToken: string
  ) => {
    if (availableTeams.length === 0) {
      console.log('No teams available for user');
      setCurrentTeamState(null);
      setCurrentTeamLabs([]);
      return;
    }

    // Try to restore team from localStorage
    const storedTeam = loadCurrentTeamFromStorage();

    if (storedTeam) {
      // Verify that the stored team is still valid (user still has access)
      const isValidTeam = availableTeams.some(
        (team) => team.uniqueID === storedTeam.uniqueID
      );

      if (isValidTeam) {
        // Find the full team object with current data
        const currentTeamData = availableTeams.find(
          (team) => team.uniqueID === storedTeam.uniqueID
        );
        console.log(
          'Restored valid team from storage:',
          currentTeamData?.ent_name
        );
        setCurrentTeamState(currentTeamData || null);
        // Update storage with fresh data
        if (currentTeamData) {
          saveCurrentTeamToStorage(currentTeamData);
          // Load labs for the restored team
          await loadLabsForCurrentTeam(currentTeamData, userToken);
        }
      } else {
        // Stored team is no longer valid, clear it and set first available team
        console.log(
          'Stored team is no longer accessible, using first available team'
        );
        localStorage.removeItem(CURRENT_TEAM_STORAGE_KEY);
        const firstTeam = availableTeams[0];
        setCurrentTeamState(firstTeam);
        saveCurrentTeamToStorage(firstTeam);
        await loadLabsForCurrentTeam(firstTeam, userToken);
      }
    } else {
      // No stored team, set first available team
      console.log('No stored team, using first available team');
      const firstTeam = availableTeams[0];
      setCurrentTeamState(firstTeam);
      saveCurrentTeamToStorage(firstTeam);
      await loadLabsForCurrentTeam(firstTeam, userToken);
    }
  };

  // Load workspace data after user is authenticated
  const loadWorkspaceData = async (userToken: string) => {
    try {
      // Get user's workspace list from the API
      const userWorkspaces = await userService.getUserWorkspaces(userToken);

      if (userWorkspaces.length > 0) {
        // Use the first workspace the user has access to
        const firstWorkspaceItem = userWorkspaces[0];

        // Now fetch the full workspace details with teamspaces
        const fullWorkspaceData = await workspaceService.getWorkspace(
          firstWorkspaceItem._id,
          userToken
        );
        setWorkspace(fullWorkspaceData);

        // Set teamspaces from workspace data
        const userTeamspaces = fullWorkspaceData.teamspaces_details || [];
        setTeamspaces(userTeamspaces);

        // Set current teamspace to first available if any
        if (userTeamspaces.length > 0) {
          setCurrentTeamspace(userTeamspaces[0]);
        }
      } else {
        console.warn('User has no workspaces available');
        setWorkspace(null);
        setTeamspaces([]);
        setCurrentTeamspace(null);
      }
    } catch (error) {
      console.error('Failed to load workspace data:', error);
      // Don't throw here, just log the error
      // User can still use the app without workspace data
      setWorkspace(null);
      setTeamspaces([]);
      setCurrentTeamspace(null);
    }
  };

  // Check for existing token on mount
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoadingUser(true); // Set loading user to true at start

      if (authService.hasStoredToken()) {
        try {
          // Get the stored token first
          const storedToken = authService.getStoredToken();
          if (storedToken) {
            setToken(storedToken);

            // Try to verify the token and get basic user data
            const userData = await authService.verifyToken(storedToken);
            setUser(userData);
            setIsLoadingUser(false); // User data loaded

            // Update token if the API returned a new one
            const finalToken = userData.auth_key || storedToken;
            if (userData.auth_key && userData.auth_key !== storedToken) {
              setToken(userData.auth_key);
              authService.setStoredToken(userData.auth_key);
            }

            // Load extended user data (will use reliable ID if needed)
            await loadExtendedUserData(userData, finalToken);

            // Load whiteboard data
            await loadWhiteboardData(userData, finalToken);

            // Load relationship data (includes team persistence logic and lab loading)
            await loadRelationshipData(userData, finalToken);

            // Load workspace data
            await loadWorkspaceData(finalToken);
          }
        } catch (error) {
          console.error('Failed to verify stored token:', error);
          setIsLoadingUser(false); // Stop loading user even on error

          // Only clear token if it's definitely invalid (401/403)
          if (error instanceof Error && error.message.includes('401')) {
            console.log('Token is invalid, clearing auth state');
            await authService.logout();
            setUser(null);
            setExtendedUser(null);
            setToken(null);
            setWorkspace(null);
            setTeamspaces([]);
            setCurrentTeamspace(null);
            setUserRelationships(null);
            setCurrentTeamState(null);
            setCurrentOrganization(null);
            setWhiteboardId(null);
            setCurrentTeamLabs([]);
          } else {
            // Network error or other issue - keep the stored token
            const storedToken = authService.getStoredToken();
            if (storedToken) {
              setToken(storedToken);
              console.log(
                'Keeping stored token due to network error, user can retry'
              );
            }
          }
        }
      } else {
        setIsLoadingUser(false); // No token, so not loading user
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (credentials: LoginRequest): Promise<void> => {
    setIsLoading(true);
    setIsLoadingUser(true); // Set loading user during login

    try {
      const { token: authToken, user: userData } = await authService.login(
        credentials
      );
      setUser(userData);
      setToken(authToken);
      setIsLoadingUser(false); // User data loaded

      // Load extended user data after successful login
      await loadExtendedUserData(userData, authToken);

      // Load whiteboard data after successful login
      await loadWhiteboardData(userData, authToken);

      // Load relationship data after successful login (includes team persistence and lab loading)
      await loadRelationshipData(userData, authToken);

      // Load workspace data after successful login
      await loadWorkspaceData(authToken);
    } catch (error) {
      console.error('Login failed:', error);
      setIsLoadingUser(false); // Stop loading user on error
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    setIsLoadingUser(true); // Set loading during logout

    try {
      await authService.logout();

      // Clear stored team data
      localStorage.removeItem(CURRENT_TEAM_STORAGE_KEY);
      console.log('Cleared stored team data on logout');

      setUser(null);
      setExtendedUser(null);
      setToken(null);
      setWorkspace(null);
      setTeamspaces([]);
      setCurrentTeamspace(null);
      setUserRelationships(null);
      setCurrentTeamState(null);
      setCurrentOrganization(null);
      setWhiteboardId(null);
      setCurrentTeamLabs([]);
    } catch (error) {
      console.error('Logout failed:', error);
      // Still clear local state even if API call fails
      localStorage.removeItem(CURRENT_TEAM_STORAGE_KEY);
      setUser(null);
      setExtendedUser(null);
      setToken(null);
      setWorkspace(null);
      setTeamspaces([]);
      setCurrentTeamspace(null);
      setUserRelationships(null);
      setCurrentTeamState(null);
      setCurrentOrganization(null);
      setWhiteboardId(null);
      setCurrentTeamLabs([]);
    } finally {
      setIsLoading(false);
      setIsLoadingUser(false); // Stop loading user after logout
    }
  };

  const refreshWorkspace = async (): Promise<void> => {
    if (!user || !token || !workspace) {
      return;
    }

    try {
      await loadWorkspaceData(token);
    } catch (error) {
      console.error('Failed to refresh workspace data:', error);
      throw error;
    }
  };

  const refreshUser = async (): Promise<void> => {
    if (!user || !token) {
      return;
    }

    try {
      const userData = await authService.verifyToken(token);
      await loadExtendedUserData(userData, token);
    } catch (error) {
      console.error('Failed to refresh user data:', error);
      throw error;
    }
  };

  const refreshRelationships = async (): Promise<void> => {
    if (!user || !token) {
      return;
    }

    try {
      await loadRelationshipData(user, token);
    } catch (error) {
      console.error('Failed to refresh relationship data:', error);
      throw error;
    }
  };

  const refreshWhiteboard = async (): Promise<void> => {
    if (!user || !token) {
      return;
    }

    try {
      await loadWhiteboardData(user, token);
    } catch (error) {
      console.error('Failed to refresh whiteboard data:', error);
      throw error;
    }
  };

  const handleSetCurrentTeamspace = (teamspace: TeamspaceListItem | null) => {
    setCurrentTeamspace(teamspace);
  };

  // Helper methods for checking permissions
  const isOrgAdmin = (): boolean => {
    if (!currentOrganization) return false;
    return currentOrganization.user_relationships.includes('admin');
  };

  const isTeamAdmin = (teamId?: string): boolean => {
    const team = teamId
      ? userRelationships?.teams.find(
          (t) => t.uniqueID === teamId || t._id === teamId
        )
      : currentTeam;

    if (!team) return false;
    return team.user_relationships.includes('admin');
  };

  const isTeamEditor = (teamId?: string): boolean => {
    const team = teamId
      ? userRelationships?.teams.find(
          (t) => t.uniqueID === teamId || t._id === teamId
        )
      : currentTeam;

    if (!team) return false;
    return team.user_relationships.includes('editor');
  };

  const isTeamViewer = (teamId?: string): boolean => {
    const team = teamId
      ? userRelationships?.teams.find(
          (t) => t.uniqueID === teamId || t._id === teamId
        )
      : currentTeam;

    if (!team) return false;
    return team.user_relationships.includes('viewer');
  };

  const contextValue: AuthContextType = {
    user,
    token,
    workspace,
    currentTeamspace,
    teamspaces,
    userRelationships,
    currentTeam,
    currentOrganization,
    whiteboardId,
    currentTeamLabs,
    isLoadingLabs,
    login,
    logout,
    setCurrentTeamspace: handleSetCurrentTeamspace,
    setCurrentTeam,
    refreshWorkspace,
    refreshUser,
    refreshRelationships,
    refreshWhiteboard,
    refreshLabs,
    isOrgAdmin,
    isTeamAdmin,
    isTeamEditor,
    isTeamViewer,
    isLoading,
    isLoadingUser, // Add this new flag
    isAuthenticated: !!user,
    extendedUser,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
