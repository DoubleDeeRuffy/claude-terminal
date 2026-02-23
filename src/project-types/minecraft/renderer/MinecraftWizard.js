/**
 * Minecraft Wizard Module
 * Provides wizard fields and config extraction for Minecraft project creation
 */

const { t } = require('../../../renderer/i18n');

/**
 * Get HTML for Minecraft-specific wizard fields
 * @returns {string} HTML string for form fields
 */
function getWizardFields() {
  return `
    <div class="minecraft-config" style="display: none;">
      <div class="wizard-field">
        <label class="wizard-label">${t('minecraft.wizard.serverType')}</label>
        <select id="sel-minecraft-type" class="wizard-select">
          <option value="auto">${t('minecraft.wizard.typeAuto')}</option>
          <option value="paper">${t('minecraft.wizard.typePaper')}</option>
          <option value="vanilla">${t('minecraft.wizard.typeVanilla')}</option>
          <option value="forge">${t('minecraft.wizard.typeForge')}</option>
          <option value="fabric">${t('minecraft.wizard.typeFabric')}</option>
        </select>
      </div>

      <div class="wizard-field" id="field-minecraft-jar">
        <label class="wizard-label">${t('minecraft.wizard.serverJar')}</label>
        <div class="wizard-input-row">
          <input type="text" id="inp-minecraft-jar" placeholder="server.jar" class="wizard-input">
          <button type="button" id="btn-browse-minecraft-jar" class="wizard-browse-btn" title="${t('newProject.browse')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
          </button>
        </div>
      </div>

      <div class="wizard-field" id="field-minecraft-script" style="display: none;">
        <label class="wizard-label">${t('minecraft.wizard.launchScript')}</label>
        <div class="wizard-input-row">
          <input type="text" id="inp-minecraft-script" placeholder="run.bat" class="wizard-input">
          <button type="button" id="btn-browse-minecraft-script" class="wizard-browse-btn" title="${t('newProject.browse')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
          </button>
        </div>
      </div>

      <div class="wizard-inline-fields">
        <div class="wizard-field wizard-field-inline">
          <label class="wizard-label">${t('minecraft.wizard.jvmMemory')}</label>
          <input type="text" id="inp-minecraft-memory" placeholder="2G" value="2G" class="wizard-input">
          <span class="wizard-hint">${t('minecraft.wizard.jvmMemoryHint')}</span>
        </div>
        <div class="wizard-field wizard-field-inline">
          <label class="wizard-label">${t('minecraft.wizard.serverPort')}</label>
          <input type="number" id="inp-minecraft-port" placeholder="25565" value="25565" class="wizard-input">
        </div>
      </div>

      <div class="wizard-collapsible" id="minecraft-plugin-section">
        <button type="button" class="wizard-collapsible-toggle" id="btn-toggle-plugin">
          <svg class="wizard-collapsible-chevron" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          <span>${t('minecraft.plugin.createPlugin')}</span>
          <input type="checkbox" id="chk-minecraft-plugin" style="display: none;">
        </button>
        <div class="wizard-collapsible-content" id="minecraft-plugin-fields">
          <div class="wizard-inline-fields">
            <div class="wizard-field wizard-field-inline">
              <label class="wizard-label">${t('minecraft.plugin.provider')}</label>
              <select id="sel-plugin-provider" class="wizard-select">
                <option value="paper">Paper</option>
                <option value="spigot">Spigot</option>
                <option value="bukkit">Bukkit</option>
              </select>
            </div>
            <div class="wizard-field wizard-field-inline">
              <label class="wizard-label">${t('minecraft.plugin.apiVersion')}</label>
              <select id="sel-plugin-version" class="wizard-select">
                <option value="1.21.4">1.21.4</option>
                <option value="1.21">1.21</option>
                <option value="1.20.6">1.20.6</option>
                <option value="1.20.4">1.20.4</option>
                <option value="1.19.4">1.19.4</option>
                <option value="1.18.2">1.18.2</option>
              </select>
            </div>
          </div>
          <div class="wizard-field">
            <label class="wizard-label">${t('minecraft.plugin.buildTool')}</label>
            <select id="sel-plugin-build" class="wizard-select">
              <option value="maven">${t('minecraft.plugin.maven')}</option>
              <option value="gradle">${t('minecraft.plugin.gradle')}</option>
            </select>
          </div>
          <div class="wizard-inline-fields">
            <div class="wizard-field wizard-field-inline">
              <label class="wizard-label">${t('minecraft.plugin.groupId')}</label>
              <input type="text" id="inp-plugin-group" class="wizard-input" placeholder="com.example">
            </div>
            <div class="wizard-field wizard-field-inline">
              <label class="wizard-label">${t('minecraft.plugin.pluginName')}</label>
              <input type="text" id="inp-plugin-name" class="wizard-input" placeholder="MyPlugin">
            </div>
          </div>
          <div class="wizard-inline-fields">
            <div class="wizard-field wizard-field-inline">
              <label class="wizard-label">${t('minecraft.plugin.author')}</label>
              <input type="text" id="inp-plugin-author" class="wizard-input" placeholder="YourName">
            </div>
            <div class="wizard-field wizard-field-inline">
              <label class="wizard-label">${t('minecraft.plugin.description')}</label>
              <input type="text" id="inp-plugin-desc" class="wizard-input" placeholder="A Minecraft plugin">
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Called when a project type is selected in the wizard
 * @param {HTMLFormElement} form
 * @param {boolean} isSelected
 */
function onWizardTypeSelected(form, isSelected) {
  const config = form.querySelector('.minecraft-config');
  if (config) {
    config.style.display = isSelected ? 'block' : 'none';
  }
}

/**
 * Toggle JAR vs Script field based on server type
 * @param {HTMLFormElement} form
 * @param {string} serverType
 */
function _toggleTypeFields(form, serverType) {
  const jarField = form.querySelector('#field-minecraft-jar');
  const scriptField = form.querySelector('#field-minecraft-script');
  if (!jarField || !scriptField) return;

  const usesScript = serverType === 'forge' || serverType === 'fabric';
  jarField.style.display = usesScript ? 'none' : 'block';
  scriptField.style.display = usesScript ? 'block' : 'none';
}

/**
 * Bind Minecraft-specific wizard events
 * @param {HTMLFormElement} form
 * @param {Object} api - The electron API
 */
function bindWizardEvents(form, api) {
  // Server type selector
  const typeSelect = form.querySelector('#sel-minecraft-type');
  if (typeSelect) {
    typeSelect.onchange = () => {
      _toggleTypeFields(form, typeSelect.value);
    };
  }

  // Browse JAR
  const browseJarBtn = form.querySelector('#btn-browse-minecraft-jar');
  if (browseJarBtn) {
    browseJarBtn.onclick = async () => {
      const file = await api.dialog.selectFile({
        filters: [{ name: 'JAR files', extensions: ['jar'] }]
      });
      if (file) {
        form.querySelector('#inp-minecraft-jar').value = file;
      }
    };
  }

  // Browse launch script
  const browseScriptBtn = form.querySelector('#btn-browse-minecraft-script');
  if (browseScriptBtn) {
    browseScriptBtn.onclick = async () => {
      const file = await api.dialog.selectFile({
        filters: [{ name: 'Scripts', extensions: ['bat', 'cmd', 'sh'] }]
      });
      if (file) {
        form.querySelector('#inp-minecraft-script').value = file;
      }
    };
  }

  // Plugin collapsible toggle
  const toggleBtn = form.querySelector('#btn-toggle-plugin');
  const pluginCheckbox = form.querySelector('#chk-minecraft-plugin');
  if (toggleBtn && pluginCheckbox) {
    toggleBtn.onclick = () => {
      pluginCheckbox.checked = !pluginCheckbox.checked;
      const section = form.querySelector('#minecraft-plugin-section');
      if (section) {
        section.classList.toggle('expanded', pluginCheckbox.checked);
      }
    };
  }
}

/**
 * Extract Minecraft-specific config from the wizard form
 * @param {HTMLFormElement} form
 * @returns {Object} Config to merge into the project
 */
function getWizardConfig(form) {
  const serverType = form.querySelector('#sel-minecraft-type')?.value || 'auto';
  const serverJar = form.querySelector('#inp-minecraft-jar')?.value?.trim() || '';
  const launchScript = form.querySelector('#inp-minecraft-script')?.value?.trim() || '';
  const jvmMemory = form.querySelector('#inp-minecraft-memory')?.value?.trim() || '2G';
  const serverPort = parseInt(form.querySelector('#inp-minecraft-port')?.value || '25565', 10);

  const isPlugin = form.querySelector('#chk-minecraft-plugin')?.checked;

  return {
    minecraftConfig: {
      serverType,
      serverJar: serverJar || null,
      launchScript: launchScript || null,
      jvmMemory,
      serverPort,
      plugin: isPlugin ? {
        provider: form.querySelector('#sel-plugin-provider')?.value || 'paper',
        version: form.querySelector('#sel-plugin-version')?.value || '1.21.4',
        buildTool: form.querySelector('#sel-plugin-build')?.value || 'maven',
        groupId: form.querySelector('#inp-plugin-group')?.value?.trim() || 'com.example',
        pluginName: form.querySelector('#inp-plugin-name')?.value?.trim() || 'MyPlugin',
        author: form.querySelector('#inp-plugin-author')?.value?.trim() || '',
        description: form.querySelector('#inp-plugin-desc')?.value?.trim() || ''
      } : null
    }
  };
}

/**
 * Get the Maven repository URL for a provider
 * @param {string} provider
 * @returns {string}
 */
function _getRepository(provider) {
  if (provider === 'paper') return 'https://repo.papermc.io/repository/maven-public/';
  return 'https://hub.spigotmc.org/nexus/content/repositories/snapshots/';
}

/**
 * Get the Maven groupId:artifactId for a provider
 * @param {string} provider
 * @returns {{ groupId: string, artifactId: string }}
 */
function _getArtifact(provider) {
  if (provider === 'paper') return { groupId: 'io.papermc.paper', artifactId: 'paper-api' };
  if (provider === 'spigot') return { groupId: 'org.spigotmc', artifactId: 'spigot-api' };
  return { groupId: 'org.bukkit', artifactId: 'bukkit' };
}

/**
 * Extract major.minor version from a version string like "1.21.4"
 * @param {string} version
 * @returns {string} e.g. "1.21"
 */
function _apiVersion(version) {
  const parts = version.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
}

/**
 * Convert groupId to a directory path (e.g. "com.example" -> "com/example")
 * @param {string} groupId
 * @returns {string}
 */
function _groupToPath(groupId) {
  return groupId.replace(/\./g, '/');
}

/**
 * Generate plugin project files in the given directory
 * @param {string} projectPath - Absolute path to the project directory
 * @param {Object} pluginConfig - Plugin configuration from wizard
 */
async function generatePluginFiles(projectPath, pluginConfig) {
  const fs = window.electron_nodeModules.fs;
  const path = window.electron_nodeModules.path;
  const { provider, version, buildTool, groupId, pluginName, author, description } = pluginConfig;

  const repo = _getRepository(provider);
  const artifact = _getArtifact(provider);
  const apiVer = _apiVersion(version);
  const mavenVersion = `${version}-R0.1-SNAPSHOT`;
  const groupPath = _groupToPath(groupId);
  const javaDir = path.join(projectPath, 'src', 'main', 'java', ...groupId.split('.'));
  const resourcesDir = path.join(projectPath, 'src', 'main', 'resources');

  // Ensure directories exist
  fs.mkdirSync(javaDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });

  // Generate build files
  if (buildTool === 'maven') {
    const pom = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>${groupId}</groupId>
    <artifactId>${pluginName}</artifactId>
    <version>1.0-SNAPSHOT</version>
    <packaging>jar</packaging>

    <repositories>
        <repository>
            <id>${provider}</id>
            <url>${repo}</url>
        </repository>
    </repositories>

    <dependencies>
        <dependency>
            <groupId>${artifact.groupId}</groupId>
            <artifactId>${artifact.artifactId}</artifactId>
            <version>${mavenVersion}</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.13.0</version>
                <configuration>
                    <source>21</source>
                    <target>21</target>
                </configuration>
            </plugin>
        </plugins>
    </build>

    <properties>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
</project>
`;
    fs.writeFileSync(path.join(projectPath, 'pom.xml'), pom, 'utf8');
  } else {
    // Gradle
    const buildGradle = `plugins {
    id 'java'
    id 'com.github.johnrengelman.shadow' version '8.1.1'
}

group = '${groupId}'
version = '1.0-SNAPSHOT'

repositories {
    maven { url '${repo}' }
}

dependencies {
    compileOnly '${artifact.groupId}:${artifact.artifactId}:${mavenVersion}'
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

tasks.withType(JavaCompile).configureEach {
    options.encoding = 'UTF-8'
}
`;
    const settingsGradle = `rootProject.name = '${pluginName}'
`;
    fs.writeFileSync(path.join(projectPath, 'build.gradle'), buildGradle, 'utf8');
    fs.writeFileSync(path.join(projectPath, 'settings.gradle'), settingsGradle, 'utf8');
  }

  // plugin.yml
  const authorLine = author ? `author: ${author}\n` : '';
  const descLine = description ? `description: ${description}\n` : '';
  const pluginYml = `name: ${pluginName}
version: '\${project.version}'
main: ${groupId}.${pluginName}
api-version: '${apiVer}'
${authorLine}${descLine}`;
  fs.writeFileSync(path.join(resourcesDir, 'plugin.yml'), pluginYml, 'utf8');

  // Main Java class
  const javaClass = `package ${groupId};

import org.bukkit.plugin.java.JavaPlugin;

public final class ${pluginName} extends JavaPlugin {

    @Override
    public void onEnable() {
        getLogger().info("${pluginName} has been enabled!");
    }

    @Override
    public void onDisable() {
        getLogger().info("${pluginName} has been disabled!");
    }
}
`;
  fs.writeFileSync(path.join(javaDir, `${pluginName}.java`), javaClass, 'utf8');
}

module.exports = {
  getWizardFields,
  onWizardTypeSelected,
  bindWizardEvents,
  getWizardConfig,
  generatePluginFiles
};
