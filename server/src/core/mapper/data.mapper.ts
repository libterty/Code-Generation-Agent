export interface DataMapper<Entity, DTO> {
  toDTO(entity: Entity, ...args: any): DTO;
}
