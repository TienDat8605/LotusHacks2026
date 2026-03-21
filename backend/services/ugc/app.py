from fastapi import FastAPI

from ugc.router import create_ugc_router

app = FastAPI()
app.include_router(create_ugc_router())

