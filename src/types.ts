export interface ComponentInfo {
  slug: string;
  name: string;
  description: string;
  category: string;
}

export interface ComponentRegistry {
  components: ComponentInfo[];
  bySlug: Map<string, ComponentInfo>;
}

export interface PropertyInfo {
  name: string;
  type: string;
  default: string;
  required: boolean;
  description: string;
}

export interface PropertiesSection {
  heading: string;
  properties: PropertyInfo[];
}

export interface DevelopData {
  sections: PropertiesSection[];
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
