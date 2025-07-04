// services/subjectService.ts

const API_BASE_URL = 'https://fast.futurity.science';
const MANAGEMENT_API_BASE_URL = 'https://fast.futurity.science/management';
const GRAPHS_API_BASE_URL = 'https://fast.futurity.science/graphs';
const LEGACY_API_BASE_URL = 'https://tools.futurity.science/api'; // Fallback for organizations

// Type definitions for the new Subject API
export interface SubjectIndexes {
  HR?: number;
  TT?: number;
  WS?: number;
}

export interface SubjectXRL {
  IRL: number;
  SRL: number;
  ERL: number;
  BRL: number;
  CRL: number;
}

export interface SubjectData {
  _id: string;
  Google_hitcounts: number;
  Papers_hitcounts: number;
  Books_hitcounts: number;
  Gnews_hitcounts: number;
  Related_terms: string;
  wikipedia_definition: string;
  wiktionary_definition: string;
  FST: string;
  wikipedia_url: string;
  ent_name: string;
  FS_Cards: string;
  subject: string;
  ent_fsid: string;
  ent_summary: string;
  fs_card: string;
  last_update: string;
  category?: string;
  ent_year?: number;
  inventor?: string;
  synonyms: string[];
  indexes: SubjectIndexes[];
  xRL: SubjectXRL[];
}

// Legacy stats types (for fallback)
export interface SubjectStats {
  Press?: number;
  Patents?: number;
  Papers?: number;
  Books?: number;
  Organizations?: number;
}

export interface SubjectStatsResponse {
  Press?: number;
  Patents?: number;
  Papers?: number;
  Books?: number;
  Organizations?: number;
}

// Ridgeline data types
export interface RidgelineData {
  _generated_at: number;
  plot_data: unknown[];
  plot_layout: unknown;
  _generated_finish_at: number;
  _generated_duration: number;
}

// Network graph data types
export interface NetworkGraphData {
  nodes: unknown[];
  edges: unknown[];
  // Add other network graph properties as needed
}

// Whiteboard types
export type WhiteboardSubjectsResponse = string[];

export interface AddToWhiteboardRequest {
  subject: string; // fsid format
}

export interface AddToWhiteboardResponse {
  success: boolean;
  message: string;
}

class SubjectService {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Get subject data by fsid from the new management API
   * @param subjectFsid - The fsid of the subject (e.g., "fsid_metaverse")
   * @returns Promise<SubjectData>
   */
  async getSubjectData(subjectFsid: string): Promise<SubjectData> {
    try {
      console.log('Fetching subject data for:', subjectFsid);

      const response = await fetch(
        `${MANAGEMENT_API_BASE_URL}/subjects/${subjectFsid}`,
        {
          method: 'GET',
          headers: this.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Subject with fsid "${subjectFsid}" not found`);
        }
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.');
        }
        throw new Error(
          `Failed to fetch subject data: ${response.status} ${response.statusText}`
        );
      }

      const data: SubjectData = await response.json();
      console.log('Successfully fetched subject data');
      return data;
    } catch (error) {
      console.error('Get subject data error:', error);
      throw error;
    }
  }

  /**
   * Get ridgeline graph data for trends
   * @param subjectFsid - The fsid of the subject
   * @returns Promise<RidgelineData>
   */
  async getRidgelineData(subjectFsid: string): Promise<RidgelineData> {
    try {
      const response = await fetch(
        `${GRAPHS_API_BASE_URL}/ridgeline-data?subject=${subjectFsid}`,
        {
          method: 'GET',
          headers: this.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch ridgeline data: ${response.status}`);
      }

      const data: RidgelineData = await response.json();
      return data;
    } catch (error) {
      console.error('Get ridgeline data error:', error);
      throw error;
    }
  }

  /**
   * Get network graph data
   * @param subjectFsid - The fsid of the subject
   * @param limit - Limit for the data (default: 1000)
   * @returns Promise<NetworkGraphData>
   */
  async getNetworkGraphData(
    subjectFsid: string,
    limit: number = 1000
  ): Promise<NetworkGraphData> {
    try {
      const response = await fetch(
        `${GRAPHS_API_BASE_URL}/graph-data?subjects=${subjectFsid}&limit=${limit}&debug=false`,
        {
          method: 'GET',
          headers: this.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch network graph data: ${response.status}`
        );
      }

      const data: NetworkGraphData = await response.json();
      return data;
    } catch (error) {
      console.error('Get network graph data error:', error);
      throw error;
    }
  }

  /**
   * Get subject statistics - try new API first, fallback to legacy
   * @param subjectFsid - The fsid of the subject
   * @returns Promise<SubjectStatsResponse>
   */
  async getSubjectStats(subjectFsid: string): Promise<SubjectStatsResponse> {
    try {
      // First try the new API
      const response = await fetch(
        `${API_BASE_URL}/hitcounts/get-subject-stats/${subjectFsid}`,
        {
          method: 'GET',
          headers: this.getAuthHeaders(),
        }
      );

      if (response.ok) {
        const data: SubjectStatsResponse = await response.json();
        return data;
      }

      // If new API fails, try legacy API for organizations
      console.warn('New stats API failed, trying legacy API for organizations');
      return await this.getLegacySubjectStats(subjectFsid);
    } catch (error) {
      console.error('Get subject stats error:', error);
      // Try legacy API as fallback
      try {
        return await this.getLegacySubjectStats(subjectFsid);
      } catch (legacyError) {
        console.error('Legacy stats API also failed:', legacyError);
        throw error; // Throw original error
      }
    }
  }

  /**
   * Fallback method for getting stats from legacy API
   * @param subjectFsid - The fsid of the subject
   * @returns Promise<SubjectStatsResponse>
   */
  private async getLegacySubjectStats(
    subjectFsid: string
  ): Promise<SubjectStatsResponse> {
    // Convert fsid back to slug for legacy API
    const slug = subjectFsid.replace('fsid_', '');

    const response = await fetch(
      `${LEGACY_API_BASE_URL}/subject/get-counts?slug=${slug}`,
      {
        headers: this.getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Legacy stats API failed: ${response.status}`);
    }

    const data = await response.json();

    // Transform legacy response to match new format
    return {
      Organizations: data.counts?.Organization || 0,
      Press: data.counts?.Press || 0,
      Patents: data.counts?.Patent || 0,
      Papers: data.counts?.Paper || 0,
      Books: data.counts?.Book || 0,
    };
  }

  /**
   * Check if subject exists in user's whiteboard
   * @param whiteboardId - The whiteboard ID
   * @param subjectFsid - The fsid of the subject
   * @returns Promise<boolean>
   */
  async isSubjectInWhiteboard(
    whiteboardId: string,
    subjectFsid: string
  ): Promise<boolean> {
    try {
      console.log('Checking if subject is in whiteboard:', {
        whiteboardId,
        subjectFsid,
      });

      const response = await fetch(
        `${MANAGEMENT_API_BASE_URL}/whiteboards/${whiteboardId}/subjects`,
        {
          method: 'GET',
          headers: this.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.log('Whiteboard not found or has no subjects');
          return false; // Whiteboard doesn't exist or has no subjects
        }
        throw new Error(`Failed to check whiteboard: ${response.status}`);
      }

      const data: WhiteboardSubjectsResponse = await response.json();
      console.log('Whiteboard subjects:', data);

      // Check if the subject fsid exists in the whiteboard (data is an array of strings)
      const isInWhiteboard = data.includes(subjectFsid);
      console.log('Subject in whiteboard:', isInWhiteboard);

      return isInWhiteboard;
    } catch (error) {
      console.error('Check whiteboard error:', error);
      return false; // Assume not in whiteboard if check fails
    }
  }

  /**
   * Add subject to user's whiteboard
   * @param whiteboardId - The whiteboard ID
   * @param subjectFsid - The fsid of the subject
   * @returns Promise<AddToWhiteboardResponse>
   */
  async addToWhiteboard(
    whiteboardId: string,
    subjectFsid: string
  ): Promise<AddToWhiteboardResponse> {
    try {
      const requestBody: AddToWhiteboardRequest = {
        subject: subjectFsid,
      };

      console.log('Adding subject to whiteboard:', {
        whiteboardId,
        subjectFsid,
      });

      const response = await fetch(
        `${MANAGEMENT_API_BASE_URL}/whiteboards/${whiteboardId}/subjects`,
        {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.');
        }
        if (response.status === 403) {
          throw new Error(
            'You do not have permission to modify this whiteboard.'
          );
        }
        if (response.status === 404) {
          throw new Error('Whiteboard not found.');
        }
        throw new Error(
          `Failed to add to whiteboard: ${response.status} ${response.statusText}`
        );
      }

      // Try to parse the response, but handle cases where it might be empty or not JSON
      let data: AddToWhiteboardResponse;
      const responseText = await response.text();

      if (responseText.trim() === '') {
        // Empty response means success
        data = { success: true, message: 'Successfully added to whiteboard' };
      } else {
        try {
          data = JSON.parse(responseText);
        } catch (_parseError) {
          // If response isn't JSON, assume success since status was ok
          data = { success: true, message: 'Successfully added to whiteboard' };
        }
      }

      console.log('Add to whiteboard response:', data);
      return data;
    } catch (error) {
      console.error('Add to whiteboard error:', error);
      throw error;
    }
  }

  /**
   * Create fsid from search query by adding "fsid_" prefix and normalizing
   * @param query - The search query
   * @returns string - The formatted fsid
   */
  createFsidFromQuery(query: string): string {
    return `fsid_${query
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w_]/g, '')}`;
  }

  /**
   * Create fsid from slug by adding "fsid_" prefix
   * @param slug - The subject slug
   * @returns string - The formatted fsid
   */
  createFsidFromSlug(slug: string): string {
    return `fsid_${slug.toLowerCase().replace(/\s+/g, '_')}`;
  }

  /**
   * Create slug from fsid by removing "fsid_" prefix
   * @param fsid - The subject fsid
   * @returns string - The slug
   */
  createSlugFromFsid(fsid: string): string {
    return fsid.replace('fsid_', '');
  }

  /**
   * Format stat value for display - shows "N/A" for missing/zero values
   * @param value - The stat value
   * @returns string - Formatted display value
   */
  formatStatValue(value?: number): string {
    if (value === undefined || value === null || value === 0) {
      return 'N/A';
    }
    return value.toLocaleString();
  }

  /**
   * Get all stats with proper formatting for display
   * @param stats - Raw stats response
   * @returns Object with formatted stat values and raw numbers
   */
  getFormattedStats(stats: SubjectStatsResponse) {
    return {
      organizations: {
        raw: stats.Organizations || 0,
        formatted: this.formatStatValue(stats.Organizations),
      },
      press: {
        raw: stats.Press || 0,
        formatted: this.formatStatValue(stats.Press),
      },
      patents: {
        raw: stats.Patents || 0,
        formatted: this.formatStatValue(stats.Patents),
      },
      papers: {
        raw: stats.Papers || 0,
        formatted: this.formatStatValue(stats.Papers),
      },
      books: {
        raw: stats.Books || 0,
        formatted: this.formatStatValue(stats.Books),
      },
    };
  }

  /**
   * Get simple formatted stats for Search page display
   * @param stats - Raw stats response
   * @returns Object with simple string values for React rendering
   */
  getSimpleFormattedStats(stats: SubjectStatsResponse) {
    return {
      organizations: this.formatStatValue(stats.Organizations),
      press: this.formatStatValue(stats.Press),
      patents: this.formatStatValue(stats.Patents),
      papers: this.formatStatValue(stats.Papers),
      books: this.formatStatValue(stats.Books),
    };
  }

  /**
   * Get index value from subject indexes array
   * @param indexes - Array of index objects
   * @param key - Index key (HR, TT, WS)
   * @returns number | null
   */
  getIndexValue(
    indexes: SubjectIndexes[] | undefined,
    key: 'HR' | 'TT' | 'WS'
  ): number | null {
    if (!indexes || indexes.length === 0) return null;
    const value = indexes[0][key];
    return value !== undefined ? value : null;
  }

  /**
   * Format index value for display
   * @param value - The index value
   * @returns string - Formatted display value
   */
  formatIndexValue(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    return value.toFixed(1);
  }

  /**
   * Get formatted display name for inventor
   * @param inventor - The inventor string
   * @returns string - Display name or "Unknown"
   */
  getInventorDisplay(inventor?: string): string {
    if (!inventor || inventor.trim() === '') {
      return 'Unknown';
    }
    return inventor;
  }

  /**
   * Check if category should be displayed
   * @param category - The category string
   * @returns boolean - Whether to display category
   */
  shouldDisplayCategory(category?: string): boolean {
    return !!(category && category.trim() !== '');
  }
}

export const subjectService = new SubjectService();
