export class StudentCard {
  constructor(
    public readonly id: number,
    public readonly studentId: number,
    public readonly userId: number,
  ) {}

  updateStudentId(studentId: number): StudentCard {
    return new StudentCard(this.id, studentId, this.userId);
  }
}
