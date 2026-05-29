FROM maven:3.9.12-eclipse-temurin-21-alpine AS build
WORKDIR /build
COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 \
    mvn -DskipTests dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -DskipTests package \
    && cp "$(find target -maxdepth 1 -type f -name '*.jar' ! -name '*.original' | head -n 1)" /build/app.jar

FROM eclipse-temurin:21-jre
WORKDIR /opt/java-app
COPY --from=build /build/app.jar /opt/java-app/app.jar
ENTRYPOINT ["java", "-jar", "/opt/java-app/app.jar"]
