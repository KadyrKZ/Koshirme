from pydantic import BaseModel, Field, field_validator

from app.schemas.api import ORMModel


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str):
        return value.strip().lower()


class TeacherCreate(LoginRequest):
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str):
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()


class UserOut(ORMModel):
    id: str
    email: str
    name: str
    role: str
    active: bool


class LoginOut(BaseModel):
    token: str
    user: UserOut


class AccountStatus(BaseModel):
    active: bool


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=6, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)
