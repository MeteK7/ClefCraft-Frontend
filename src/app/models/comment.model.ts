export interface Comment {
  id: number;
  entityType: string;
  entityId: number;
  parentCommentId: number | null;
  bodyHtml: string | null;
  isDeleted: boolean;
  authorUserId: string;
  authorFullName: string;
  dateCreated: string | null;
  dateModified: string | null;
  isEdited: boolean;
  mentionedUserIds: string[];
}

export interface MentionableUser {
  userId: string;
  fullName: string;
}
